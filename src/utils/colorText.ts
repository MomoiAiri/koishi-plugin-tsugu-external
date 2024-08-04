declare global {
  interface String {
      color(colorCode: string): string;
  }
}

String.prototype.color = function(colorCode) {
  // 检查 colorCode 是否是以 '#' 开头的 7 位字符串
  if (typeof colorCode !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(colorCode)) {
      throw new Error('Invalid color code. Please use a string in the format #RRGGBB.');
  }

  return `\x1b[38;2;${parseInt(colorCode.slice(1, 3), 16)};${parseInt(colorCode.slice(3, 5), 16)};${parseInt(colorCode.slice(5, 7), 16)}m${this}\x1b[0m`;
};

export {};