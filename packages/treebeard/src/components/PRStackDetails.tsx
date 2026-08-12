import { Badge, Box, Collapse, Group, Loader, ScrollArea, Stack, Text, Tooltip } from '@mantine/core'
import { IconAlertTriangle, IconGitBranch } from '@tabler/icons-react'
import { PRBadge } from './PRBadge'
import type { PRStackDetails, PRStackSummary, StackPR } from '../shared/types'

interface PRStackDetailsProps {
  summary: PRStackSummary | null
  details: PRStackDetails | null
  loading: boolean
  opened: boolean
}

interface StackLayerPRBadgeProps {
  pr: StackPR | null
  prInfo: PRStackDetails['layers'][number]['prInfo']
}

const STATE_COLOR = {
  OPEN: 'cyan',
  CLOSED: 'pink',
  MERGED: 'violet'
}

function StackLayerPRBadge({ pr, prInfo }: StackLayerPRBadgeProps) {
  if (prInfo) return <PRBadge pr={prInfo} loading={false} />

  if (!pr) {
    return (
      <Badge variant="light" color="gray" size="sm">
        No PR
      </Badge>
    )
  }

  return (
    <Badge
      variant="light"
      color={STATE_COLOR[pr.state]}
      size="sm"
      style={{ cursor: 'pointer' }}
      onClick={() => window.open(pr.url, '_blank')}
    >
      #{pr.number} {pr.state.toLowerCase()}
    </Badge>
  )
}

export function PRStackDetails({ summary, details, loading, opened }: PRStackDetailsProps) {
  if (!summary || summary.layers.length < 2) return null

  return (
    <Collapse in={opened}>
      <Box mt="sm" pt="sm" style={{ borderTop: '1px solid rgba(0, 136, 255, 0.16)' }}>
        <Group justify="space-between" mb="xs">
          <Group gap={6}>
            <IconGitBranch size={15} color="#9c6ade" />
            <Text size="xs" fw={600}>Stack from {summary.trunk}</Text>
          </Group>
          {loading && <Loader size={13} color="violet" />}
        </Group>

        <ScrollArea.Autosize mah={240} type="auto">
          <Stack gap="xs">
            {summary.layers.map((layer, index) => {
              const detail = details?.layers.find((detailLayer) => detailLayer.branch === layer.branch)
              const prInfo = detail?.prInfo ?? null

              return (
                <Box
                  key={layer.branch}
                  pl="sm"
                  style={{
                    borderLeft: index < summary.layers.length - 1 ? '2px solid rgba(156, 106, 222, 0.45)' : '2px solid transparent',
                    background: layer.isCurrent ? 'rgba(156, 106, 222, 0.08)' : undefined,
                    borderRadius: 4
                  }}
                >
                  <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Group gap={6} wrap="nowrap">
                        <Badge variant="light" color="violet" size="xs" style={{ flexShrink: 0 }}>
                          {index + 1}/{summary.layers.length}
                        </Badge>
                        <Text size="xs" fw={layer.isCurrent ? 700 : 500} truncate style={{ fontFamily: 'monospace' }}>
                          {layer.branch}
                        </Text>
                        {layer.isCurrent && (
                          <Badge variant="light" color="neon" size="xs" style={{ flexShrink: 0 }}>
                            current
                          </Badge>
                        )}
                      </Group>
                    </div>

                    <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                      {layer.needsRebase && (
                        <Tooltip label="This branch needs to be rebased onto its parent">
                          <Badge variant="light" color="yellow" size="sm" leftSection={<IconAlertTriangle size={11} />}>
                            Rebase
                          </Badge>
                        </Tooltip>
                      )}
                      <StackLayerPRBadge pr={layer.pr} prInfo={prInfo} />
                    </Group>
                  </Group>
                </Box>
              )
            })}
          </Stack>
        </ScrollArea.Autosize>
      </Box>
    </Collapse>
  )
}
