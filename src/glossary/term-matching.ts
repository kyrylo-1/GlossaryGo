const searchCollator = new Intl.Collator("und", { sensitivity: "accent", usage: "search" });

const normalize = (value: string): string => {
  return value.normalize("NFC");
};

export const areTermsEquivalent = (left: string, right: string): boolean => {
  return searchCollator.compare(normalize(left), normalize(right)) === 0;
};

export const termStartsWith = (term: string, query: string): boolean => {
  const normalizedTerm = normalize(term);
  const normalizedQuery = normalize(query);
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
