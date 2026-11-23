"""Vérificateur des niveaux de Signal (langue extraterrestre à déchiffrer).

Pour chaque niveau, on énumère toutes les hypothèses de grammaire et de vocabulaire compatibles avec
les transmissions reçues (glyphes + image dont on connaît le sens). Une question est valide si toutes
les hypothèses compatibles donnent la même réponse : la réponse est alors entièrement déterminée par
ce que le joueur a vu, sans deviner.

Usage : python3 tools/signal/verify.py
Les données doivent rester identiques à src/games/signal/levels.ts.
"""
import itertools

# --- Vraie langue (sert à produire les transmissions) ---
# Chiffres en base 4, chiffre le plus fort en premier.
DIGIT = {0: "B", 1: "C", 2: "D", 3: "A"}
NOUN = {"soleil": "E", "planete": "F", "lune": "G", "etre": "I"}
ORBIT, DIE, GO, FUT = "H", "J", "K", "L"


# ============ Niveau 1 : compter ============
L1_EXAMPLES = [(1, "C"), (3, "A"), (4, "CB"), (6, "CD"), (9, "DC"), (15, "AA")]
L1_READ = [("AD", 14)]
L1_WRITE = [11, 16]


def to_base(n, b):
    if n == 0:
        return [0]
    out = []
    while n:
        out.append(n % b)
        n //= b
    return out[::-1]


def level1():
    glyphs = sorted({g for _, s in L1_EXAMPLES for g in s})
    hyps = []
    for base in range(2, 9):
        extra = [f"?{i}" for i in range(max(0, base - len(glyphs)))]  # chiffres jamais vus
        pool = glyphs + extra
        if len(pool) < base:
            continue
        for digits in itertools.permutations(pool, base):  # digits[v] = glyphe du chiffre v
            for msb_first in (True, False):
                def enc(n, base=base, digits=digits, msb_first=msb_first):
                    ds = to_base(n, base)
                    if not msb_first:
                        ds = ds[::-1]
                    return "".join(digits[d] if not digits[d].startswith("?") else "?" for d in ds)
                if all(enc(n) == s for n, s in L1_EXAMPLES):
                    hyps.append(enc)
    reads = []
    for s, expected in L1_READ:
        vals = set()
        for enc in hyps:
            vals |= {n for n in range(0, 300) if enc(n) == s}
        reads.append((s, vals, expected))
    writes = [(n, {enc(n) for enc in hyps}) for n in L1_WRITE]
    return len(hyps), reads, writes


# ============ Niveaux 2 et 3 : phrases ============
def numeral(n):
    return "".join(DIGIT[d] for d in to_base(n, 4))


class Grammar:
    """Une hypothèse de grammaire : vocabulaire + ordre des mots."""

    def __init__(self, nouns, orbit, num_after, omit_one, orbit_order, die=None, go=None, fut=None,
                 intr_order=None, go_order=None, fut_pos=None):
        self.nouns, self.orbit = nouns, orbit
        self.num_after, self.omit_one, self.orbit_order = num_after, omit_one, orbit_order
        self.die, self.go, self.fut = die, go, fut
        self.intr_order, self.go_order, self.fut_pos = intr_order, go_order, fut_pos

    def np(self, noun, n):
        num = "" if (n == 1 and self.omit_one) else numeral(n)
        return self.nouns[noun] + num if self.num_after else num + self.nouns[noun]

    def verb(self, v, fut):
        if not fut:
            return v
        return v + self.fut if self.fut_pos == "after" else self.fut + v

    def say(self, sem):
        k = sem[0]
        if k == "np":
            return self.np(sem[1], sem[2])
        if k == "orbit":
            parts = {"a": self.np(*sem[1]), "c": self.np(*sem[2]), "v": self.orbit}
            return "".join(parts[x] for x in self.orbit_order)
        fut = sem[-1]
        if k == "die":
            parts = {"s": self.np(*sem[1]), "v": self.verb(self.die, fut)}
            out = "".join(parts[x] for x in self.intr_order)
        else:  # go
            parts = {"s": self.np(*sem[1]), "g": self.np(*sem[2]), "v": self.verb(self.go, fut)}
            out = "".join(parts[x] for x in self.go_order)
        if fut and self.fut_pos == "initial":
            out = self.fut + out.replace(self.fut, "", 1)
        return out


def truth():
    return Grammar(dict(NOUN), ORBIT, True, True, "acv", DIE, GO, FUT, "sv", "sgv", "after")


# Niveau 2
L2_EXAMPLES = [
    (("np", "soleil", 2), None),
    (("np", "planete", 1), None),
    (("np", "lune", 3), None),
    (("orbit", ("planete", 1), ("soleil", 2)), None),
    (("orbit", ("lune", 2), ("planete", 1)), None),
]
L2_WRITE = [("orbit", ("planete", 8), ("soleil", 1)), ("orbit", ("lune", 1), ("planete", 1))]

# Niveau 3
L3_EXAMPLES = [
    ("np", "etre", 1),
    ("np", "etre", 3),
    ("die", ("soleil", 1), False),
    ("die", ("planete", 2), True),
    ("go", ("etre", 2), ("soleil", 1), False),
    ("go", ("etre", 1), ("planete", 1), True),
]
L3_WRITE = [("die", ("soleil", 3), True), ("go", ("etre", 1), ("planete", 2), False)]
L3_FINAL = [("die", ("soleil", 2), True), ("go", ("etre", 64), ("soleil", 1), True)]


def level2():
    T = truth()
    seen = [T.say(s) for s, _ in L2_EXAMPLES]
    glyphs = sorted({g for s in seen for g in s} - set(DIGIT.values()))
    hyps = []
    for perm in itertools.permutations(glyphs, 4):
        nouns = {"soleil": perm[0], "planete": perm[1], "lune": perm[2]}
        for num_after, omit_one, order in itertools.product((True, False), (True, False),
                                                            ["".join(p) for p in itertools.permutations("acv")]):
            g = Grammar(nouns, perm[3], num_after, omit_one, order)
            if all(g.say(s) == w for (s, _), w in zip(L2_EXAMPLES, seen)):
                hyps.append(g)
    return len(hyps), [(s, {g.say(s) for g in hyps}) for s in L2_WRITE]


def level3():
    T = truth()
    seen = [T.say(s) for s in L3_EXAMPLES]
    known = set(DIGIT.values()) | {NOUN["soleil"], NOUN["planete"], NOUN["lune"], ORBIT}
    new = sorted({g for s in seen for g in s} - known)
    hyps = []
    base = dict(nouns={k: v for k, v in NOUN.items() if k != "etre"}, orbit=ORBIT, num_after=True, omit_one=True,
                orbit_order="acv")
    for perm in itertools.permutations(new, 4):
        nouns = dict(base["nouns"], etre=perm[0])
        for intr, go_o, fpos in itertools.product(("sv", "vs"), ["".join(p) for p in itertools.permutations("sgv")],
                                                  ("after", "before", "initial")):
            g = Grammar(nouns, ORBIT, True, True, "acv", perm[1], perm[2], perm[3], intr, go_o, fpos)
            if all(g.say(s) == w for s, w in zip(L3_EXAMPLES, seen)):
                hyps.append(g)
    writes = [(s, {g.say(s) for g in hyps}) for s in L3_WRITE]
    final = [T.say(s) for s in L3_FINAL]
    return len(hyps), writes, final, seen


if __name__ == "__main__":
    n, reads, writes = level1()
    print("Niveau 1 :", n, "hypothèse(s) compatible(s)")
    for s, vals, exp in reads:
        print("  lire", s, "->", vals, "attendu", exp, "OK" if vals == {exp} else "AMBIGU")
    for num, outs in writes:
        print("  écrire", num, "->", outs, "OK" if len(outs) == 1 and "?" not in next(iter(outs)) else "AMBIGU")

    n, writes = level2()
    T = truth()
    print("Niveau 2 :", n, "hypothèse(s) ; transmissions :", [T.say(s) for s, _ in L2_EXAMPLES])
    for s, outs in writes:
        print("  écrire", s, "->", outs, "OK" if len(outs) == 1 else "AMBIGU")

    n, writes, final, seen = level3()
    print("Niveau 3 :", n, "hypothèse(s) ; transmissions :", seen)
    for s, outs in writes:
        print("  écrire", s, "->", outs, "OK" if len(outs) == 1 else "AMBIGU")
    # Le message final n'est pas une question : il suffit qu'une seule grammaire reste possible pour qu'il n'ait qu'un sens.
    print("  message final", final, "OK (une seule grammaire possible)" if n == 1 else "AMBIGU")
    print("  questions niveau 1 en glyphes :", {n: numeral(n) for n in L1_WRITE})
