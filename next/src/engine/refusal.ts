// A refusal in words, with the constraints (or parts) that hold the thing back named. Its own file so that what the screen uses (the sketch's definition, trim) does not pull the kernel in with it.
export class Refusal extends Error { readonly victims: string[]; constructor(message: string, victims: string[]) { super(message); this.victims = victims; } }
