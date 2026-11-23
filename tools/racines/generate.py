"""Générateur de grilles pour Racines.

Règles simulées :
- 3 graines (0 coquelicot, 1 bleuet, 2 bouton d'or), une de chaque, jamais sur un rocher ni sous un indice.
- Les racines avancent d'une case par jour (4 directions) en contournant les rochers.
  Elles passent sous les autres fleurs : le jour d'arrivée d'une couleur = distance (BFS) à sa graine.
- Une case fleurit de la couleur dont la racine arrive en premier. Égalité -> terre nue.

Indices possibles : (case, couleur, jour), (case, couleur, None), (case, "nue").

Une grille est retenue si :
- la solution est unique (recherche exhaustive sur tous les triplets de graines) ;
- un solveur « humain » la résout : il raisonne indice par indice (cohérence d'arc généralisée)
  sans jamais faire d'hypothèse.

Usage : python3 tools/racines/generate.py [graine_aléatoire] [nombre]
"""
import json
import random
import sys
from collections import deque

import numpy as np

N = 6
BARE = "nue"


def bfs(start, rocks):
    dist = np.full(N * N, 99, dtype=np.int16)
    dist[start] = 0
    q = deque([start])
    while q:
        x = q.popleft()
        r, c = divmod(x, N)
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            rr, cc = r + dr, c + dc
            y = rr * N + cc
            if 0 <= rr < N and 0 <= cc < N and y not in rocks and dist[y] == 99:
                dist[y] = dist[x] + 1
                q.append(y)
    return dist


def garden(seeds, D):
    """Jardin final : (couleur ou BARE, jour) pour chaque case."""
    out = {}
    for x in range(N * N):
        ds = [D[s][x] for s in seeds]
        m = min(ds)
        if m >= 99:
            continue
        winners = [i for i, d in enumerate(ds) if d == m]
        out[x] = (winners[0] if len(winners) == 1 else BARE, int(m))
    return out


class Puzzle:
    def __init__(self, rocks):
        self.rocks = rocks
        self.free = [x for x in range(N * N) if x not in rocks]
        self.D = {x: bfs(x, rocks) for x in self.free}
        self.m = len(self.free)
        # Dm[i, x] : distance de la case libre n°i à la case x
        self.Dm = np.stack([self.D[x] for x in self.free])
        idx = np.arange(self.m)
        self.distinct = (idx[:, None, None] != idx[None, :, None]) & (idx[:, None, None] != idx[None, None, :]) & (
            idx[None, :, None] != idx[None, None, :])

    def clue_tensor(self, clue):
        x, kind, day = clue
        d = self.Dm[:, x]
        a, b, c = d[:, None, None], d[None, :, None], d[None, None, :]
        ds = (a, b, c)
        no_seed_here = (a > 0) & (b > 0) & (c > 0)
        if kind == BARE:
            m = np.minimum(np.minimum(a, b), c)
            cnt = (a == m).astype(np.int8) + (b == m) + (c == m)
            t = cnt >= 2
        else:
            me = ds[kind]
            others = [ds[i] for i in range(3) if i != kind]
            t = (me < others[0]) & (me < others[1])
            if day is not None:
                t = t & (me == day)
        return t & no_seed_here

    def solutions(self, clues):
        t = self.distinct.copy()
        for cl in clues:
            t &= self.clue_tensor(cl)
        return np.argwhere(t)

    def human(self, clues):
        """Cohérence d'arc indice par indice. Renvoie le nombre de passes, ou None si bloqué."""
        tensors = [self.clue_tensor(cl) for cl in clues]
        masks = [np.ones(self.m, bool) for _ in range(3)]
        passes = 0
        while True:
            passes += 1
            changed = False
            for t in tensors:
                tt = t & masks[0][:, None, None] & masks[1][None, :, None] & masks[2][None, None, :]
                new = [tt.any(axis=(1, 2)), tt.any(axis=(0, 2)), tt.any(axis=(0, 1))]
                for i in range(3):
                    if (new[i] != masks[i]).any():
                        masks[i] = new[i]
                        changed = True
            if all(m.sum() == 1 for m in masks):
                return passes
            if not changed:
                return None


def connected(rocks):
    free = [x for x in range(N * N) if x not in rocks]
    d = bfs(free[0], rocks)
    return all(d[x] < 99 for x in free)


def make(rnd):
    rocks = set(rnd.sample(range(N * N), rnd.choice((3, 4, 5))))
    if not connected(rocks):
        return None
    p = Puzzle(rocks)
    seeds = rnd.sample(p.free, 3)
    g = garden(seeds, p.D)
    sizes = [sum(1 for v in g.values() if v[0] == i) for i in range(3)]
    if min(sizes) < 5:
        return None
    # point de départ : tous les indices complets hors graines
    clues = [(x, col, day) for x, (col, day) in g.items() if x not in seeds]
    clues = [(x, col, None if col == BARE else day) for x, col, day in clues]
    if len(p.solutions(clues)) != 1 or p.human(clues) is None:
        return None
    rnd.shuffle(clues)
    # 1) retirer des indices ; 2) dégrader « couleur + jour » en « couleur seule »
    for cl in list(clues):
        trial = [c for c in clues if c != cl]
        if len(p.solutions(trial)) == 1 and p.human(trial) is not None:
            clues = trial
    for cl in list(clues):
        if cl[1] != BARE and cl[2] is not None:
            trial = [c if c != cl else (cl[0], cl[1], None) for c in clues]
            if len(p.solutions(trial)) == 1 and p.human(trial) is not None:
                clues = trial
    passes = p.human(clues)
    kinds = {"jour": sum(1 for c in clues if c[1] != BARE and c[2] is not None),
             "couleur": sum(1 for c in clues if c[1] != BARE and c[2] is None),
             "nue": sum(1 for c in clues if c[1] == BARE)}
    return dict(rocks=sorted(rocks), seeds=seeds, clues=clues, passes=passes, kinds=kinds)


def to_json(pz, name):
    rc = lambda x: [x // N, x % N]
    return {
        "name": name,
        "n": N,
        "rocks": [rc(x) for x in pz["rocks"]],
        "seeds": [rc(x) for x in pz["seeds"]],
        "clues": [rc(x) + [c, d] for x, c, d in sorted(pz["clues"])],
    }


def show(pz):
    sym = {0: "R", 1: "B", 2: "J"}
    g = [["." for _ in range(N)] for _ in range(N)]
    for x in pz["rocks"]:
        g[x // N][x % N] = "#"
    for x, c, d in pz["clues"]:
        g[x // N][x % N] = "n" if c == BARE else (sym[c] if d is None else f"{sym[c].lower()}")
    for i, x in enumerate(pz["seeds"]):
        g[x // N][x % N] = "*" + sym[i]
    return "\n".join(" ".join(f"{s:>2}" for s in row) for row in g)


if __name__ == "__main__":
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    want = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    rnd = random.Random(seed)
    found = []
    tries = 0
    while len(found) < want and tries < 20000:
        tries += 1
        pz = make(rnd)
        if pz:
            found.append(pz)
            print(len(found), "passes", pz["passes"], pz["kinds"], "indices", len(pz["clues"]), file=sys.stderr)
    json.dump([to_json(pz, f"#{i}") | {"passes": pz["passes"], "kinds": pz["kinds"]} for i, pz in enumerate(found)],
              sys.stdout)
