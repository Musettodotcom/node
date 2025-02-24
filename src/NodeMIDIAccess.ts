import { Omnibus } from "@hypersphere/omnibus";
import {
  IMIDIAccess,
  IMIDIInput,
  IMIDIOutput,
  UnregisterCallback,
} from "@midival/core";
import {
  InputStateChangeCallback,
  OutputStateChangeCallback,
} from "@midival/core/dist/wrappers/access/IMIDIAccess";
import { NodeMIDIInput } from "./NodeMIDIInput";
import { NodeMIDIOutput } from "./NodeMIDIOutput";
import { VirtualNodeMIDIInput } from "./VirtualNodeMIDIInput";
import { VirtualNodeMIDIOutput } from "./VirtualNodeMIDIOutput";
import { randomUUID } from "crypto";

const range = (i: number) =>
  Array.apply(null, Array(i)).map(function (_, i) {
    return i;
  });

export interface NodeMidiOptions {
  watchTimeout: number;
}

const defaultOptions: NodeMidiOptions = {
  watchTimeout: 1000,
};

interface Events {
  input_connected: [NodeMIDIInput];
  input_disconnected: [IMIDIInput];
  output_conntected: [NodeMIDIOutput];
  output_disconnected: [IMIDIOutput];
}

class NodeMIDIAccess implements IMIDIAccess {
  private static _midi: any;
  private _options: NodeMidiOptions;
  private _bus: Omnibus<Events> = new Omnibus<Events>();
  private virtualInputs = [];
  private virtualOutputs = [];
  private midiInputs: Map<string, NodeMIDIInput> = new Map<
    string,
    NodeMIDIInput
  >();
  private midiOutputs: Map<string, NodeMIDIOutput> = new Map<
    string,
    NodeMIDIOutput
  >();

  private isWatchingInputs: boolean = false;
  private isWatchingOutputs: boolean = false;

  static getMidiLibrary() {
    return this._midi;
  }

  constructor(midi: any, options: NodeMidiOptions = defaultOptions) {
    NodeMIDIAccess._midi = midi;
    this._options = options;
  }

  private watchInputs() {
    if (this.isWatchingInputs) {
      return;
    }
    if (!this._options.watchTimeout) {
      return;
    }
    this.isWatchingInputs = true;
    let prevInputs = this.inputs;
    const checkChanges = () => {
      const inputs = this.inputs;
      inputs.forEach((input) => {
        const pastInput = prevInputs.find((pIn) => pIn.name === input.name);
        if (!pastInput) {
          this._bus.trigger("input_connected", input);
        }
      });
      prevInputs.forEach((prevIn, idx) => {
        const newInp = inputs.find((nIn) => nIn.name === prevIn.name);
        if (!newInp) {
          this._bus.trigger("input_disconnected", prevIn);
          this.midiInputs.delete(prevIn.name);
        }
      });
      prevInputs = this.inputs;
      setTimeout(checkChanges, this._options.watchTimeout);
    };
    setTimeout(checkChanges, this._options.watchTimeout);
  }

  private watchOutputs() {
    if (this.isWatchingOutputs) {
      return;
    }
    if (!this._options.watchTimeout) {
      return;
    }
    this.isWatchingOutputs = true;
    let prevOutputs = this.outputs;
    const checkChanges = () => {
      const outputs = this.outputs;
      outputs.forEach((output, idx) => {
        const pastOutput = prevOutputs.find((pIn) => pIn.name === output.name);
        if (!pastOutput) {
          this._bus.trigger(
            "output_conntected", output
          );
        }
      });
      prevOutputs.forEach((prevOut, idx) => {
        const newOut = this.outputs.find((nOut) => nOut.name === prevOut.name);
        if (!newOut) {
          this._bus.trigger("output_disconnected", prevOut);
          this.midiOutputs.delete(prevOut.name);
        }
      });
      prevOutputs = this.outputs;
      setTimeout(checkChanges, this._options.watchTimeout);
    };

    setTimeout(checkChanges, this._options.watchTimeout);
  }

  onInputConnected(callback: InputStateChangeCallback): UnregisterCallback {
    this.watchInputs();
    return this._bus.on("input_connected", callback);
  }
  onInputDisconnected(callback: InputStateChangeCallback): UnregisterCallback {
    this.watchInputs();
    return this._bus.on("input_disconnected", callback);
  }
  onOutputConnected(callback: OutputStateChangeCallback): UnregisterCallback {
    this.watchOutputs();
    return this._bus.on("output_conntected", callback);
  }
  onOutputDisconnected(
    callback: OutputStateChangeCallback
  ): UnregisterCallback {
    this.watchOutputs();
    return this._bus.on("output_disconnected", callback);
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }
  createVirtualInputPort(name: string): VirtualNodeMIDIInput {
    const input = new VirtualNodeMIDIInput(name);
    const disconnect = input.disconnect.bind(input);
    this.virtualInputs.push(input);
    input.disconnect = () => {
      disconnect();
      this.virtualOutputs = this.virtualOutputs.filter((x) => x !== input);
    };
    return input;
  }

  createVirtualOutputPort(name: string): VirtualNodeMIDIOutput {
    const output = new VirtualNodeMIDIOutput(name);
    const disconnect = output.disconnect.bind(output);
    this.virtualOutputs.push(output);
    output.disconnect = () => {
      disconnect();
      this.virtualOutputs = this.virtualOutputs.filter((x) => x !== output);
    };
    return output;
  }

  get inputs(): NodeMIDIInput[] {
    const inputs = new (NodeMIDIAccess.getMidiLibrary().Input)();
    const inputsNo = inputs.getPortCount();

    return [
      ...range(inputsNo).map((i: number) => {
        const name = inputs.getPortName(i);
        if (!this.midiInputs.has(name)) {
          const input = new (NodeMIDIAccess.getMidiLibrary().Input)();
          input.openPort(i);
          this.midiInputs.set(
            name,
            new NodeMIDIInput(randomUUID(), name, input)
          );
        }
        return this.midiInputs.get(name);
      }),
      ...this.virtualInputs,
    ];
  }

  get outputs(): NodeMIDIOutput[] {
    const outputs = new (NodeMIDIAccess.getMidiLibrary().Output)();
    const outputsNo = outputs.getPortCount();
    return [
      ...range(outputsNo).map((i: number) => {
        const name = outputs.getPortName(i);
        if (!this.midiOutputs.has(name)) {
          const output = new (NodeMIDIAccess.getMidiLibrary().Output)();
          output.openPort(i);
          this.midiOutputs.set(
            name,
            new NodeMIDIOutput(randomUUID(), name, output)
          );
        }
        return this.midiOutputs.get(name);
      }),
      ...this.virtualOutputs,
    ];
  }
}

export { NodeMIDIAccess, IMIDIAccess };
