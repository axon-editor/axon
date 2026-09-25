/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const AVATAR_TONES = [
  "bg-[#1d3443] text-[#8fb5d1]",
  "bg-[#1c2a20] text-[#8fe3a2]",
  "bg-[#2c2414] text-[#ffd580]",
  "bg-[#341b20] text-[#ff8b92]",
  "bg-[#1a2138] text-[#a3b6e8]",
  "bg-[#2a1d2e] text-[#d9a3d9]",
];

function hashSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function ExtensionAvatar({
  name,
  publisher,
  size = "sm",
}: {
  name: string;
  publisher: string;
  size?: "sm" | "lg";
}) {
  const tone = AVATAR_TONES[hashSeed(name + publisher) % AVATAR_TONES.length];
  const label = (name[0] ?? publisher[0] ?? "?").toUpperCase();

  return (
    <div
      className={`flex shrink-0 select-none items-center justify-center rounded-lg font-semibold shadow-[0_1px_4px_rgba(0,0,0,0.35)] ${tone} ${
        size === "lg" ? "h-14 w-14 text-xl" : "h-10 w-10 text-sm"
      }`}
    >
      {label}
    </div>
  );
}