const searchCollator = new Intl.Collator("und", { sensitivity: "accent", usage: "search" });

export const normalizeTermName = (value: string): string => {
  return value.normalize("NFC");
};

export const areNormalizedTermsEquivalent = (left: string, right: string): boolean => {
  return searchCollator.compare(left, right) === 0;
};

export const areTermsEquivalent = (left: string, right: string): boolean => {
  return areNormalizedTermsEquivalent(normalizeTermName(left), normalizeTermName(right));
};

export const normalizedTermStartsWith = (normalizedTerm: string, normalizedQuery: string): boolean => {
  if (normalizedQuery.length === 0) {
    return true;
  }

  for (let end = 0; end < normalizedTerm.length;) {
    const codePoint = normalizedTerm.codePointAt(end);
    end += typeof codePoint === "number" && codePoint > 0xffff ? 2 : 1;
    if (searchCollator.compare(normalizedTerm.slice(0, end), normalizedQuery) === 0) {
      return true;
    }
  }

  return false;
};

export const termStartsWith = (term: string, query: string): boolean => {
  return normalizedTermStartsWith(normalizeTermName(term), normalizeTermName(query));
};
