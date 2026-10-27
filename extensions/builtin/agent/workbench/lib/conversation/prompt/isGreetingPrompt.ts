/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function isGreetingPrompt(prompt: string) {
  return /^(hi|hey|hello|yo|sup|good\s+(morning|afternoon|evening))[\s!.?]*$/i.test(
    prompt.trim(),
  );
}
