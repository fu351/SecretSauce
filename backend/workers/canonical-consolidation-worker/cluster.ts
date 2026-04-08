import type { CanonicalDoubleCheckDailyStatsRow } from "../../../lib/database/ingredient-match-queue-db"
import { toCanonicalTokens } from "../ingredient-worker/canonical/tokens"

const MIN_CLUSTER_SIZE = 3
const MIN_MEMBER_COVERAGE = 0.55
const LEXICAL_TOKEN_MIN_LEN = 4
const MAX_LEXICAL_TOKEN_FAMILY = 5

export interface ClusterConsolidationProposal {
  fromCanonical: string
  toCanonical: string
  commonTokens: string[]
  clusterMembers: string[]
  clusterSize: number
  maxSimilarity: number
}

export interface CanonicalClusterCommunity {
  members: string[]
  commonTokens: string[]
  clusterSize: number
  averageCoverage: number
  maxSimilarity: number
}

function tokenize(name: string): Set<string> {
  return new Set(toCanonicalTokens(name).filter((token) => token.length > 1))
}

function lexicalTokens(name: string): Set<string> {
  return new Set([...tokenize(name)].filter((token) => token.length >= LEXICAL_TOKEN_MIN_LEN))
}

function buildAdjacency(rows: CanonicalDoubleCheckDailyStatsRow[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>()

  const addEdge = (left: string, right: string): void => {
    if (!adjacency.has(left)) adjacency.set(left, new Set())
    if (!adjacency.has(right)) adjacency.set(right, new Set())
    adjacency.get(left)!.add(right)
    adjacency.get(right)!.add(left)
  }

  for (const row of rows) {
    addEdge(row.source_canonical, row.target_canonical)
  }

  return adjacency
}

function findComponents(adjacency: Map<string, Set<string>>): string[][] {
  const visited = new Set<string>()
  const components: string[][] = []

  for (const node of adjacency.keys()) {
    if (visited.has(node)) continue
    const stack = [node]
    const component: string[] = []
    visited.add(node)

    while (stack.length) {
      const current = stack.pop()!
      component.push(current)
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue
        visited.add(next)
        stack.push(next)
      }
    }

    components.push(component.sort((a, b) => a.localeCompare(b)))
  }

  return components
}

function chooseSplitToken(component: string[]): string | null {
  const tokenCounts = new Map<string, number>()

  for (const member of component) {
    for (const token of lexicalTokens(member)) {
      tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1)
    }
  }

  let bestToken: string | null = null
  let bestScore = -1
  for (const [token, count] of tokenCounts) {
    if (count < 2 || count >= component.length || count > MAX_LEXICAL_TOKEN_FAMILY) continue
    const balance = Math.min(count, component.length - count)
    const score = count * 10 + balance
    if (score > bestScore || (score === bestScore && bestToken !== null && token < bestToken)) {
      bestToken = token
      bestScore = score
    }
  }

  return bestToken
}

function partitionComponent(component: string[]): string[][] {
  if (component.length < MIN_CLUSTER_SIZE) return []

  const tokenSets = component.map((member) => tokenize(member))
  const commonTokens = intersectTokenSets(tokenSets)
  if (commonTokens.size > 0) {
    return [component]
  }

  const splitToken = chooseSplitToken(component)
  if (!splitToken) return [component]

  const withToken = component.filter((member) => lexicalTokens(member).has(splitToken))
  const withoutToken = component.filter((member) => !lexicalTokens(member).has(splitToken))

  if (withToken.length < 2 || withoutToken.length < 2) {
    return [component]
  }

  return [
    ...partitionComponent(withToken),
    ...partitionComponent(withoutToken),
  ]
}

function intersectTokenSets(tokenSets: Array<Set<string>>): Set<string> {
  if (!tokenSets.length) return new Set()
  const [first, ...rest] = tokenSets
  const result = new Set(first)
  for (const token of [...result]) {
    if (rest.some((tokens) => !tokens.has(token))) {
      result.delete(token)
    }
  }
  return result
}

function selectTarget(
  members: string[],
  commonTokens: Set<string>,
  productCounts: Map<string, number>
): string {
  const score = (name: string): [number, number, number, number, string] => {
    const tokens = tokenize(name)
    const overlap = [...tokens].filter((token) => commonTokens.has(token)).length
    const coverage = overlap / Math.max(commonTokens.size, 1)
    const purity = overlap / Math.max(tokens.size, 1)
    const count = productCounts.get(name) ?? 0
    return [coverage, purity, count, -name.length, name]
  }

  return members.reduce((best, current) => {
    const bestScore = score(best)
    const currentScore = score(current)
    return compareScores(currentScore, bestScore) > 0 ? current : best
  })
}

function compareScores(
  left: [number, number, number, number, string],
  right: [number, number, number, number, string]
): number {
  for (let i = 0; i < 4; i += 1) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1
  }
  return left[4].localeCompare(right[4]) < 0 ? 1 : -1
}

function maxSimilarityForMembers(
  members: string[],
  similarityByPair: Map<string, number>
): number {
  let maxSimilarity = 0
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const key = pairKey(members[i], members[j])
      maxSimilarity = Math.max(maxSimilarity, similarityByPair.get(key) ?? 0)
    }
  }
  return maxSimilarity
}

export function pairKey(left: string, right: string): string {
  return [left, right].sort((a, b) => a.localeCompare(b)).join("\u0000")
}

export function buildClusterConsolidationProposals(
  rows: CanonicalDoubleCheckDailyStatsRow[],
  productCounts: Map<string, number>
): ClusterConsolidationProposal[] {
  const communities = buildCanonicalClusterCommunities(rows)
  const proposals: ClusterConsolidationProposal[] = []
  for (const community of communities) {
    const target = selectTarget(community.members, new Set(community.commonTokens), productCounts)
    for (const member of community.members) {
      if (member === target) continue
      proposals.push({
        fromCanonical: member,
        toCanonical: target,
        commonTokens: community.commonTokens,
        clusterMembers: community.members,
        clusterSize: community.clusterSize,
        maxSimilarity: community.maxSimilarity,
      })
    }
  }

  return proposals.sort((a, b) => {
    if (b.clusterSize !== a.clusterSize) return b.clusterSize - a.clusterSize
    return a.fromCanonical.localeCompare(b.fromCanonical)
  })
}

export function buildCanonicalClusterCommunities(
  rows: CanonicalDoubleCheckDailyStatsRow[]
): CanonicalClusterCommunity[] {
  const lateralRows = rows.filter((row) => row.direction === "lateral")
  if (!lateralRows.length) return []

  const adjacency = buildAdjacency(lateralRows)
  const components = findComponents(adjacency)
  const similarityByPair = new Map<string, number>()

  for (const row of lateralRows) {
    const key = pairKey(row.source_canonical, row.target_canonical)
    similarityByPair.set(key, Math.max(similarityByPair.get(key) ?? 0, row.max_similarity ?? 0))
  }

  const communities: CanonicalClusterCommunity[] = []
  for (const component of components) {
    if (component.length < MIN_CLUSTER_SIZE) continue

    for (const community of partitionComponent(component)) {
      if (community.length < MIN_CLUSTER_SIZE) continue

      const tokenSets = community.map((member) => tokenize(member))
      const commonTokens = intersectTokenSets(tokenSets)
      if (!commonTokens.size) continue

      const averageCoverage =
        tokenSets.reduce((sum, tokens) => {
          const overlap = [...tokens].filter((token) => commonTokens.has(token)).length
          return sum + overlap / Math.max(tokens.size, 1)
        }, 0) / tokenSets.length

      if (averageCoverage < MIN_MEMBER_COVERAGE) continue

      communities.push({
        members: [...community].sort((a, b) => a.localeCompare(b)),
        commonTokens: [...commonTokens].sort((a, b) => a.localeCompare(b)),
        clusterSize: community.length,
        averageCoverage,
        maxSimilarity: maxSimilarityForMembers(community, similarityByPair),
      })
    }
  }

  return communities.sort((a, b) => {
    if (b.clusterSize !== a.clusterSize) return b.clusterSize - a.clusterSize
    return a.members.join("|").localeCompare(b.members.join("|"))
  })
}
