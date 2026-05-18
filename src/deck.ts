import { renderPresentation } from "./compiler.js";
import type { DeckOptions, OutputConfig, SlideFactory } from "./authoring/index.js";
import type { PresentationIR } from "./ir/index.js";
import { outputPresentation } from "./node.js";

export class Deck {
  readonly #options: DeckOptions;
  readonly #slides: SlideFactory[] = [];

  constructor(options: DeckOptions) {
    this.#options = options;
  }

  add(slide: SlideFactory): this {
    this.#slides.push(slide);
    return this;
  }

  render(): PresentationIR {
    return renderPresentation(this.#options, this.#slides);
  }

  async output(config: OutputConfig): Promise<void> {
    await outputPresentation(this.render(), config);
  }
}
