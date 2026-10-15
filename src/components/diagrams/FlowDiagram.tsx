/**
 * Interactive React Flow rendering of a blueprint path.
 *
 * - Layout: dagre layered (top-down).
 * - Per-use-case persistence: drag positions saved under `flowLayoutKey`
 *   (a stable key combining UseCase id + path kind) in localStorage.
 * - Reset button clears positions and re-runs dagre.
 * - PNG export via `html-to-image`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type NodeChange,
  type NodePositionChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toFlow, type AzureServiceNode as AzureServiceNodeType } from '@/lib/diagram/blueprint-to-flow'
import { layoutNodes } from '@/lib/diagram/layout'
import type { BlueprintPathKind, BlueprintResult } from '@/lib/solution-blueprint/types'
import { Button } from '@/components/ui/button'
import { ArrowsClockwise, Download } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { AzureServiceNode } from './AzureServiceNode'

const NODE_TYPES = { azureService: AzureServiceNode }

interface FlowDiagramProps {
  result: BlueprintResult
  pathKind: BlueprintPathKind
  /** Optional storage key (UseCase id + path) to persist drag positions. */
  flowLayoutKey?: string
  className?: string
}

interface PersistedLayout {
  positions: Record<string, { x: number; y: number }>
}

function readLayout(key: string | undefined): PersistedLayout | null {
  if (!key || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as PersistedLayout) : null
  } catch {
    return null
  }
}

function writeLayout(key: string | undefined, layout: PersistedLayout) {
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(layout))
  } catch {
    // best-effort; localStorage may be full or unavailable.
  }
}

function FlowDiagramInner({ result, pathKind, flowLayoutKey, className }: FlowDiagramProps) {
  const { nodes: rawNodes, edges } = useMemo(() => toFlow(result, pathKind), [result, pathKind])

  // Apply dagre layout, then overlay any persisted positions.
  const initialNodes = useMemo(() => {
    const laid = layoutNodes(rawNodes, edges)
    const persisted = readLayout(flowLayoutKey)
    if (!persisted) return laid
    return laid.map((n) =>
      persisted.positions[n.id] ? { ...n, position: persisted.positions[n.id] } : n,
    )
  }, [rawNodes, edges, flowLayoutKey])

  const [nodes, setNodes] = useState<AzureServiceNodeType[]>(initialNodes)

  // When the source result/path changes, re-seed.
  useEffect(() => {
    setNodes(initialNodes)
  }, [initialNodes])

  const onNodesChange = useCallback(
    (changes: NodeChange<AzureServiceNodeType>[]) => {
      setNodes((current) => applyNodeChanges(changes, current))
      // Persist on drag-stop only.
      const ended = changes.find(
        (c): c is NodePositionChange =>
          c.type === 'position' && (c as NodePositionChange).dragging === false,
      )
      if (ended && flowLayoutKey) {
        setNodes((current) => {
          const positions: Record<string, { x: number; y: number }> = {}
          for (const n of current) positions[n.id] = n.position
          writeLayout(flowLayoutKey, { positions })
          return current
        })
      }
    },
    [flowLayoutKey],
  )

  const handleReset = useCallback(() => {
    if (flowLayoutKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(flowLayoutKey)
    }
    setNodes(layoutNodes(rawNodes, edges))
    toast.success('Layout reset')
  }, [rawNodes, edges, flowLayoutKey])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const reactFlow = useReactFlow()

  const handleExportPng = useCallback(async () => {
    try {
      const { toPng } = await import('html-to-image')
      const viewport = containerRef.current?.querySelector('.react-flow__viewport') as HTMLElement | null
      const target = viewport ?? containerRef.current
      if (!target) return
      // Fit before snapshot so the export captures the full graph.
      reactFlow.fitView({ padding: 0.1, duration: 0 })
      const dataUrl = await toPng(target, {
        cacheBust: true,
        backgroundColor: '#FFFFFF',
        pixelRatio: 2,
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `ID-8-blueprint-${pathKind}.png`
      a.click()
      toast.success('PNG exported')
    } catch (e: any) {
      toast.error(`Export failed: ${e?.message ?? e}`)
    }
  }, [pathKind, reactFlow])

  return (
    <div className={`${className ?? ''} h-[520px] relative`} ref={containerRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        nodesDraggable
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
        <MiniMap pannable zoomable />
        <Controls position="bottom-right" />
      </ReactFlow>
      <div className="pointer-events-none absolute right-2 top-2 flex gap-1">
        <Button
          size="sm"
          variant="secondary"
          className="pointer-events-auto"
          onClick={handleReset}
          title="Reset to auto-layout"
        >
          <ArrowsClockwise size={14} className="mr-1" /> Reset
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="pointer-events-auto"
          onClick={handleExportPng}
          title="Export PNG"
        >
          <Download size={14} className="mr-1" /> PNG
        </Button>
      </div>
    </div>
  )
}

export function FlowDiagram(props: FlowDiagramProps) {
  return (
    <ReactFlowProvider>
      <FlowDiagramInner {...props} />
    </ReactFlowProvider>
  )
}

// Silence unused-edge-type variable in some TS configs.
export type { Edge }
