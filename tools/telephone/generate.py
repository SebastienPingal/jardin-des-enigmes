"""Générateur de grilles pour Téléphone.

Règles :
- Un collier de 6 perles, toutes différentes, passe de patte en patte entre K animaux, chacun une fois.
- Chaque animal transforme toujours le collier de la même façon (une permutation des positions).
- On connaît le collier de départ, celui d'arrivée et quelques indices :
  * instantané partiel : « après le s-ième animal, la perle en position p est X » ;
  * ordre : « A passe avant B » (pas forcément juste avant) ;
  * place : « A n'est pas en position i ».
- But : retrouver l'ordre de passage.

Une grille est retenue si :
- la solution est unique (on essaie toutes les permutations) ;
- un solveur « humain » la trouve en avançant par les deux bouts : à chaque étape, pour la prochaine
  place libre depuis le départ (ou la dernière place libre avant l'arrivée), un seul animal restant est
  compatible avec les indices qui portent sur cette étape. Aucune hypothèse à plusieurs coups.

Usage : python3 tools/telephone/generate.py [graine] [nombre_par_niveau]
"""
import itertools
import json
import random
import sys

N = 6  # perles

# Transformations : perm[i] = position d'où vient la perle qui arrive en i  (nouveau[i] = ancien[perm[i]])
ANIMALS = {
    "merle": ([5, 4, 3, 2, 1, 0], "retourne tout le collier"),
    "renard": ([1, 0, 2, 3, 4, 5], "échange les deux premières perles"),
    "blaireau": ([5, 0, 1, 2, 3, 4], "décale tout d'un cran vers la droite ; la dernière perle passe devant"),
    "ecureuil": ([1, 2, 3, 4, 5, 0], "décale tout d'un cran vers la gauche ; la première perle passe derrière"),
    "grenouille": ([3, 4, 5, 0, 1, 2], "échange les deux moitiés du collier"),
    "herisson": ([2, 1, 0, 3, 4, 5], "retourne les trois premières perles"),
    "escargot": ([5, 1, 2, 3, 4, 0], "échange la première et la dernière perle"),
    "chouette": ([0, 1, 3, 2, 4, 5], "échange les deux perles du milieu"),
}


def apply(name, state):
    perm = ANIMALS[name][0]
    return tuple(state[perm[i]] for i in range(N))


def unapply(name, state):
    perm = ANIMALS[name][0]
    out = [None] * N
    for i in range(N):
        out[perm[i]] = state[i]
    return tuple(out)


def states_of(order, start):
    out = [start]
    for a in order:
        out.append(apply(a, out[-1]))
    return out


def consistent(order, start, end, clues):
    st = states_of(order, start)
    if st[-1] != end:
        return False
    for c in clues:
        if c[0] == "snap":
            _, s, p, bead = c
            if st[s][p] != bead:
                return False
        elif c[0] == "before":
            _, a, b = c
            if order.index(a) > order.index(b):
                return False
        elif c[0] == "notat":
            _, a, i = c
            if order[i] == a:
                return False
    return True


def solutions(animals, start, end, clues):
    return [o for o in itertools.permutations(animals) if consistent(o, start, end, clues)]


def human(animals, start, end, clues):
    """Avance par les deux bouts ; renvoie le nombre d'étapes, ou None si une étape n'est pas forcée."""
    K = len(animals)
    front, back = [], []  # back : animaux placés depuis la fin, du dernier vers l'intérieur
    fstate, bstate = start, end
    snaps = [c for c in clues if c[0] == "snap"]
    befores = [c for c in clues if c[0] == "before"]
    notats = {(c[1], c[2]) for c in clues if c[0] == "notat"}

    def snap_ok(step, state):
        return all(state[p] == bead for _, s, p, bead in snaps if s == step)

    steps = 0
    while len(front) + len(back) < K:
        steps += 1
        remaining = [a for a in animals if a not in front and a not in back]
        i = len(front)  # prochaine place depuis le départ
        j = K - 1 - len(back)  # dernière place libre avant l'arrivée
        meet = i == j

        def front_ok(a):
            if (a, i) in notats:
                return False
            ns = apply(a, fstate)
            if not snap_ok(i + 1, ns):
                return False
            if meet and ns != bstate:
                return False
            # « x avant y » : y ne peut pas venir tant que x n'est pas déjà passé
            return all(not (b == a and x not in front) for _, x, b in befores)

        def back_ok(a):
            if (a, j) in notats:
                return False
            ps = unapply(a, bstate)
            if not snap_ok(j, ps):
                return False
            if meet and ps != fstate:
                return False
            return all(not (x == a and b not in back) for _, x, b in befores)

        f = [a for a in remaining if front_ok(a)]
        if len(f) == 1:
            front.append(f[0])
            fstate = apply(f[0], fstate)
            continue
        b = [a for a in remaining if back_ok(a)]
        if len(b) == 1:
            back.append(b[0])
            bstate = unapply(b[0], bstate)
            continue
        return None
    return steps


def make(rnd, K, max_clues):
    animals = rnd.sample(sorted(ANIMALS), K)
    order = animals[:]
    rnd.shuffle(order)
    start = tuple(rnd.sample(range(N), N))
    st = states_of(order, start)
    end = st[-1]
    if len(set(st)) < len(st):  # pas de collier qui revient à un état déjà vu
        return None
    pool = [("snap", s, p, st[s][p]) for s in range(1, K) for p in range(N)]
    pool += [("before", a, b) for a, b in itertools.permutations(order, 2) if order.index(a) < order.index(b)]
    pool += [("notat", a, i) for a in order for i in range(K) if order[i] != a]
    clues = pool[:]
    if len(solutions(animals, start, end, clues)) != 1 or human(animals, start, end, clues) is None:
        return None
    rnd.shuffle(clues)
    for c in list(clues):
        trial = [x for x in clues if x != c]
        if len(solutions(animals, start, end, trial)) == 1 and human(animals, start, end, trial) is not None:
            clues = trial
    if len(clues) > max_clues:
        return None
    return dict(animals=sorted(animals), order=order, start=list(start), end=list(end), clues=clues,
                steps=human(animals, start, end, clues))


if __name__ == "__main__":
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    per = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    rnd = random.Random(seed)
    out = {}
    for K, max_clues in ((4, 5), (5, 6), (6, 7)):
        found = []
        tries = 0
        while len(found) < per and tries < 4000:
            tries += 1
            pz = make(rnd, K, max_clues)
            if pz:
                found.append(pz)
                kinds = [c[0] for c in pz["clues"]]
                print(K, "indices", len(kinds), {k: kinds.count(k) for k in set(kinds)}, file=sys.stderr)
        out[K] = found
    json.dump(out, sys.stdout)
