import type {
  Placement,
  Phase,
} from '../types';
import {
  SKU_REGISTRY,
  PHASE_CAPACITY,
  CONCURRENT_CAPACITY_THRESHOLD,
  PHASE_COLORS,
  PHASE_LABELS,
} from './registry';

const MIN_START_OFFSETS: { [key: string]: Array<{ after: string; weeksAfterStart: number }> } = {
  // Define any min-start-offset constraints here
};

// Utility functions
export function addWeeks(date: Date, w: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + w * 7);
  return d;
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Get active SKUs (those that exist in registry)
export function getActiveSkus(purchasedList: string[]): string[] {
  return purchasedList.filter(sku => SKU_REGISTRY[sku]);
}

// Build pairing groups via symmetric BFS
export function buildPairingGroups(skuOrder: string[]): string[][] {
  const activeSet = new Set(skuOrder);
  const adjacency: { [key: string]: Set<string> } = {};

  skuOrder.forEach(sku => (adjacency[sku] = new Set()));
  skuOrder.forEach(sku => {
    (SKU_REGISTRY[sku].mustPairWith || []).forEach(partner => {
      if (activeSet.has(partner)) {
        adjacency[sku].add(partner);
        adjacency[partner].add(sku);
      }
    });
  });

  const visited = new Set<string>();
  const groups: string[][] = [];

  skuOrder.forEach(sku => {
    if (visited.has(sku)) return;
    const group: string[] = [];
    const queue = [sku];
    visited.add(sku);

    while (queue.length) {
      const current = queue.shift()!;
      group.push(current);
      adjacency[current].forEach(neighbor => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      });
    }
    groups.push(group);
  });

  return groups;
}

// Topological sort with optimization
export function topoSortGroups(groups: string[][], activeSkus: string[]): string[][] {
  const activeSet = new Set(activeSkus);
  const skuToGroup: { [key: string]: number } = {};
  groups.forEach((g, i) => g.forEach(sku => (skuToGroup[sku] = i)));

  const numGroups = groups.length;
  const inDegree = new Array(numGroups).fill(0);
  const adjList: Set<number>[] = Array.from({ length: numGroups }, () => new Set());

  groups.forEach((group, gIdx) => {
    group.forEach(sku => {
      (SKU_REGISTRY[sku].requires || []).forEach(dep => {
        if (!activeSet.has(dep)) return;
        const depGroup = skuToGroup[dep];
        if (depGroup === gIdx) return;
        if (!adjList[depGroup].has(gIdx)) {
          adjList[depGroup].add(gIdx);
          inDegree[gIdx]++;
        }
      });
    });
  });

  const queue: number[] = [];
  inDegree.forEach((d, i) => {
    if (d === 0) queue.push(i);
  });
  const sortedIndices: number[] = [];

  while (queue.length) {
    const curr = queue.shift()!;
    sortedIndices.push(curr);
    adjList[curr].forEach(neighbor => {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    });
  }

  if (sortedIndices.length !== numGroups) {
    throw new Error('Circular dependency detected — check SKU registry.');
  }

  let sortedGroups = sortedIndices.map(i => groups[i]);
  sortedGroups = optimizeGroupOrder(sortedGroups);

  return sortedGroups;
}

// Optimize group order to keep integrations near base modules
function optimizeGroupOrder(sortedGroups: string[][]): string[][] {
  const optimized: string[][] = [];
  const used = new Set<string>();

  sortedGroups.forEach(group => {
    const baseSkuName = group[0];
    if (used.has(baseSkuName)) return;

    optimized.push(group);
    used.add(baseSkuName);

    sortedGroups.forEach(otherGroup => {
      const otherSkuName = otherGroup[0];
      if (used.has(otherSkuName)) return;

      const otherSku = SKU_REGISTRY[otherSkuName];

      if (
        otherSku &&
        otherSku.category === 'Integrations' &&
        otherSku.requires &&
        otherSku.requires.includes(baseSkuName)
      ) {
        optimized.push(otherGroup);
        used.add(otherSkuName);
      }
    });
  });

  return optimized;
}

// Bin-pack groups into phases
export function packIntoPhases(orderedGroups: string[][], activeSkus: string[]): string[][] {
  const activeSet = new Set(activeSkus);
  const skuToGroupIdx: { [key: string]: number } = {};
  orderedGroups.forEach((g, i) => g.forEach(sku => (skuToGroupIdx[sku] = i)));

  const phases: string[][] = [];
  const groupToPhaseNum: { [key: number]: number } = {};
  const baseModulePhase: { [key: string]: number } = {};

  orderedGroups.forEach((group, gIdx) => {
    const groupCapacity = group.reduce((s, sku) => s + SKU_REGISTRY[sku].capacity, 0);

    let minPhaseNum = 1;

    group.forEach(sku => {
      (SKU_REGISTRY[sku].requires || []).forEach(dep => {
        if (!activeSet.has(dep)) return;
        const depGroupIdx = skuToGroupIdx[dep];
        if (depGroupIdx === gIdx) return;
        const depPhaseNum = groupToPhaseNum[depGroupIdx];
        if (depPhaseNum !== undefined) minPhaseNum = Math.max(minPhaseNum, depPhaseNum);
      });
    });

    const baseSkuName = group[0];
    const baseSku = SKU_REGISTRY[baseSkuName];

    if (baseSku && baseSku.category === 'Integrations' && baseSku.requires && baseSku.requires.length > 0) {
      const primaryDep = baseSku.requires[0];
      if (baseModulePhase[primaryDep] !== undefined) {
        const basePhaseNum = baseModulePhase[primaryDep];
        minPhaseNum = Math.max(minPhaseNum, basePhaseNum);
      }
    }

    let placed = false;
    for (let i = 0; i < phases.length; i++) {
      const phaseNum = i + 1;
      if (phaseNum < minPhaseNum) continue;
      const used = phases[i].reduce((s, sku) => s + SKU_REGISTRY[sku].capacity, 0);
      if (used + groupCapacity <= PHASE_CAPACITY) {
        phases[i].push(...group);
        groupToPhaseNum[gIdx] = phaseNum;

        if (!baseSku || baseSku.category !== 'Integrations') {
          baseModulePhase[baseSkuName] = phaseNum;
        }

        placed = true;
        break;
      }
    }
    if (!placed) {
      phases.push([...group]);
      groupToPhaseNum[gIdx] = phases.length;

      if (!baseSku || baseSku.category !== 'Integrations') {
        baseModulePhase[baseSkuName] = phases.length;
      }
    }
  });

  return phases;
}

// Validate custom order
export function validateCustomOrder(phases: string[][], activeSkus: string[]): string[] {
  const warnings: string[] = [];
  const activeSet = new Set(activeSkus);

  const skuToPhaseNum: { [key: string]: number } = {};
  phases.forEach((phase, i) => phase.forEach(sku => (skuToPhaseNum[sku] = i + 1)));

  phases.forEach((phase, i) => {
    const phaseNum = i + 1;
    phase.forEach(sku => {
      (SKU_REGISTRY[sku].requires || []).forEach(dep => {
        if (!activeSet.has(dep)) {
          warnings.push(`Phase ${phaseNum}: "${sku}" requires "${dep}", but it wasn't selected.`);
          return;
        }
        const depPhaseNum = skuToPhaseNum[dep];
        if (depPhaseNum > phaseNum) {
          warnings.push(`Phase ${phaseNum}: "${sku}" is scheduled before prerequisite "${dep}".`);
        }
      });
    });
  });

  return warnings;
}

// Get vendor warnings
export function getVendorWarnings(activeSkus: string[]): string[] {
  const warnings: string[] = [];
  activeSkus.forEach(sku => {
    const def = SKU_REGISTRY[sku];
    if (def && def.specialFlags && def.specialFlags.includes('requiresVendor')) {
      warnings.push(`"${sku}" requires a 3rd party Vendor PM. Submit ticket at least a month before start.`);
    }
  });
  return warnings;
}

// Build concurrent slots
function buildConcurrentSlots(phaseSkus: string[], pairingGroups: string[][]): string[][] {
  const phaseSet = new Set(phaseSkus);
  const skuToPairGroup: { [key: string]: string[] } = {};

  pairingGroups.forEach(group => {
    const members = group.filter(s => phaseSet.has(s));
    if (members.length) members.forEach(sku => (skuToPairGroup[sku] = members));
  });

  const visited = new Set<string>();
  const slots: string[][] = [];

  phaseSkus.forEach(sku => {
    if (visited.has(sku)) return;
    const slot = skuToPairGroup[sku] ? [...skuToPairGroup[sku]] : [sku];
    slot.forEach(s => visited.add(s));

    let slotCapacity = slot.reduce((s, x) => s + SKU_REGISTRY[x].capacity, 0);

    phaseSkus.forEach(other => {
      if (visited.has(other)) return;
      const otherCap = SKU_REGISTRY[other].capacity;
      if (slotCapacity + otherCap <= CONCURRENT_CAPACITY_THRESHOLD) {
        slot.push(other);
        visited.add(other);
        slotCapacity += otherCap;
      }
    });

    slots.push(slot);
  });

  while (slots.length > 1 && slots[slots.length - 1].length === 1) {
    const strandedSku = slots[slots.length - 1][0];
    if (SKU_REGISTRY[strandedSku].capacity >= 2) break;
    slots[slots.length - 2].push(strandedSku);
    slots.pop();
  }

  return slots;
}

// Assign dates to phase
export function assignDatesToPhase(
  phaseSkus: string[],
  pairingGroups: string[][],
  phaseStart: Date
): { skuDates: { [key: string]: { start: Date; end: Date } }; phaseEnd: Date } {
  const slots = buildConcurrentSlots(phaseSkus, pairingGroups);
  const skuDates: { [key: string]: { start: Date; end: Date } } = {};
  let currentDate = new Date(phaseStart);

  slots.forEach(slot => {
    const maxWeeks = Math.max(...slot.map(sku => SKU_REGISTRY[sku].weeks));
    const slotEnd = addWeeks(currentDate, maxWeeks);

    slot.forEach(sku => {
      const skuWeeks = SKU_REGISTRY[sku].weeks;

      const isDependencyInSlot = slot.some(otherSku => {
        if (otherSku === sku) return false;
        return (SKU_REGISTRY[otherSku].requires || []).includes(sku);
      });

      if (isDependencyInSlot) {
        skuDates[sku] = { start: currentDate, end: addWeeks(currentDate, skuWeeks) };
      } else {
        const skuStart = addWeeks(slotEnd, -skuWeeks);
        skuDates[sku] = { start: skuStart, end: slotEnd };
      }
    });

    currentDate = slotEnd;
  });

  return { skuDates, phaseEnd: currentDate };
}

// Build schedule from phases
export function buildScheduleFromPhases(
  phaseSkuLists: string[][],
  pairingGroups: string[][],
  startDate: Date
): {
  phases: Phase[];
  placements: Placement[];
  skuMeta: { [key: string]: { start: Date; end: Date } };
} {
  const phases = phaseSkuLists.map((_skus, i) => ({
    id: i + 1,
    label: `Phase ${i + 1}`,
    sub: PHASE_LABELS[i] || `Phase ${i + 1}`,
    color: PHASE_COLORS[i % PHASE_COLORS.length],
  }));

  const placements: Placement[] = [];
  const skuMeta: { [key: string]: { start: Date; end: Date } } = {};
  let current = new Date(startDate);

  phaseSkuLists.forEach((phaseSkus, i) => {
    const { skuDates, phaseEnd: nextPhaseStart } = assignDatesToPhase(phaseSkus, pairingGroups, current);
    phaseSkus.forEach(sku => {
      const { start, end } = skuDates[sku];
      const startWeek = Math.round((start.getTime() - startDate.getTime()) / (7 * 24 * 3600 * 1000));
      skuMeta[sku] = { start, end };
      placements.push({ skuId: sku, phase: i + 1, startWeek });
    });
    current = nextPhaseStart;
  });

  applyMinStartOffsets(skuMeta, placements, startDate);

  return { phases, placements, skuMeta };
}

// Apply min-start offsets
export function applyMinStartOffsets(
  skuMeta: { [key: string]: { start: Date; end: Date } },
  placements: Placement[],
  startDate: Date
): void {
  Object.entries(MIN_START_OFFSETS).forEach(([skuName, rules]) => {
    const target = skuMeta[skuName];
    if (!target) return;

    let minStart: Date | null = null;
    for (const rule of rules) {
      const anchor = skuMeta[rule.after];
      if (!anchor) continue;
      const candidate = addWeeks(anchor.start, rule.weeksAfterStart);
      if (minStart === null || candidate > minStart) minStart = candidate;
    }
    if (!minStart) return;

    if (target.start < minStart) {
      const duration = SKU_REGISTRY[skuName].weeks;
      const newStart = minStart as Date;
      const newEnd = addWeeks(newStart, duration);
      skuMeta[skuName] = { start: newStart, end: newEnd };

      const placement = placements.find(p => p.skuId === skuName);
      if (placement) {
        placement.startWeek = Math.round((newStart.getTime() - startDate.getTime()) / (7 * 24 * 3600 * 1000));
      }
    }
  });
}

// Check conflicts
export function checkConflictsForPlacement(skuId: string, _phase: number, startWeek: number, placements: Placement[]): string[] {
  const conflicts: string[] = [];
  const sku = SKU_REGISTRY[skuId];
  if (!sku) return conflicts;

  (sku.requires || []).forEach(dep => {
    const depPlacement = placements.find(p => p.skuId === dep);
    if (!depPlacement) return;

    if (depPlacement.startWeek > startWeek) {
      conflicts.push(`Scheduled before prerequisite "${dep}"`);
    }
  });

  return conflicts;
}
