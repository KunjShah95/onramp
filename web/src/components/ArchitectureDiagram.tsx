import { useMemo } from 'react'

interface Node {
  id: string
  group: string
  files: string[]
}

interface Edge {
  source: string
  target: string
}

interface Props {
  mermaidCode?: string
  dependencies?: Record<string, string[]>
  services?: { name: string; files: string[] }[]
}

export default function ArchitectureDiagram({ mermaidCode, dependencies, services }: Props) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = []
    const edges: Edge[] = []

    if (services && services.length > 0) {
      for (const svc of services) {
        nodes.push({
          id: svc.name,
          group: svc.name,
          files: svc.files,
        })
      }
    }

    if (dependencies) {
      for (const [source, targets] of Object.entries(dependencies)) {
        for (const target of targets) {
          edges.push({ source, target })
        }
      }
    }

    return { nodes, edges }
  }, [dependencies, services])

  if (mermaidCode) {
    return (
      <div className="bg-bg-tertiary rounded-card p-4 overflow-auto max-h-96 border border-border">
        <pre className="text-accent-from text-xs font-code whitespace-pre-wrap">{mermaidCode}</pre>
      </div>
    )
  }

  if (nodes.length === 0 && edges.length === 0) {
    return (
      <div className="text-text-muted text-center py-8 text-sm">
        Run an architecture analysis to see the diagram
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {nodes.map((node) => (
          <div key={node.id} className="bg-bg-tertiary rounded-card p-3 border border-border">
            <div className="text-sm font-medium text-accent-from mb-1">{node.id}</div>
            <div className="text-xs text-text-muted">
              {node.files.length} file{node.files.length !== 1 ? 's' : ''}
            </div>
          </div>
        ))}
      </div>

      {edges.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-text-secondary mb-2">Dependencies</h4>
          <div className="space-y-1">
            {edges.map((edge, i) => (
              <div key={i} className="text-xs text-text-muted font-code">
                {edge.source} → {edge.target}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
