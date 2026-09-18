const compareOrdinal = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
};

export const compareTermNames = (left: string, right: string): number => {
  const normalizedLeft = left.normalize("NFC");
  const normalizedRight = right.normalize("NFC");
  return (
    compareOrdinal(normalizedLeft.toLowerCase(), normalizedRight.toLowerCase()) ||
    compareOrdinal(normalizedLeft, normalizedRight) ||
    compareOrdinal(left, right)
  );
};
