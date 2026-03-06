import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { Ionicons } from '@expo/vector-icons'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import {
  exchangePairingToken,
  getCodexConversation,
  getCodexPendingActions,
  getHealth,
  getStatus,
  getWorktrees,
  interruptCodexSession,
  resumeCodexConversation,
  respondCodexPendingAction,
  startCodexSession,
  steerCodexSession,
  waitForCodexConversationUpdate
} from './src/api'
import { handleScannedPairing, resolvePairingCredentials } from './src/pairing'
import type { BridgeConnection } from './src/api'
import type {
  CodexConversationItem,
  CodexConversationSnapshot,
  CodexPendingAction,
  CodexSessionStatus,
  MobileWorktree
} from './src/types'

const BRIDGE_CONNECTION_STORAGE_KEY = 'treebeard.bridgeConnection'

function isUnauthorizedError(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('unauthorized') || normalized.includes('401')
}

async function loadStoredConnection(): Promise<BridgeConnection | null> {
  try {
    const raw = await SecureStore.getItemAsync(BRIDGE_CONNECTION_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as { baseUrl?: string; sessionToken?: string }
    if (typeof parsed.baseUrl !== 'string' || typeof parsed.sessionToken !== 'string') {
      return null
    }

    return {
      baseUrl: parsed.baseUrl,
      sessionToken: parsed.sessionToken
    }
  } catch {
    return null
  }
}

async function saveStoredConnection(connection: BridgeConnection): Promise<void> {
  try {
    await SecureStore.setItemAsync(BRIDGE_CONNECTION_STORAGE_KEY, JSON.stringify(connection))
  } catch {
    // Best-effort persistence keeps pairing usable even if storage write fails.
  }
}

async function clearStoredConnection(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(BRIDGE_CONNECTION_STORAGE_KEY)
  } catch {
    // Ignore clear failures so disconnect flow is never blocked.
  }
}

function formatSessionTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString()
}

export default function App() {
  const [baseUrlInput, setBaseUrlInput] = useState('http://192.168.1.10:8787')
  const [pairingTokenInput, setPairingTokenInput] = useState('')
  const [connection, setConnection] = useState<BridgeConnection | null>(null)
  const [worktrees, setWorktrees] = useState<MobileWorktree[]>([])
  const [homedir, setHomedir] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [scanning, setScanning] = useState(false)
  const [restoringConnection, setRestoringConnection] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedWorktree, setSelectedWorktree] = useState<MobileWorktree | null>(null)
  const [sessionStatus, setSessionStatus] = useState<CodexSessionStatus | null>(null)
  const [conversation, setConversation] = useState<CodexConversationSnapshot | null>(null)
  const [pendingActions, setPendingActions] = useState<CodexPendingAction[]>([])
  const [promptInput, setPromptInput] = useState('')
  const connectInFlightRef = useRef(false)
  const chatListRef = useRef<FlatList<CodexConversationItem> | null>(null)
  const conversationRevisionRef = useRef(0)

  const grouped = useMemo(() => {
    const map = new Map<string, MobileWorktree[]>()
    for (const item of worktrees) {
      const key = item.repo.name
      const list = map.get(key) || []
      list.push(item)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [worktrees])

  const conversationItems = useMemo(() => {
    if (!conversation) return []
    return conversation.turns.flatMap((turn) => turn.items)
  }, [conversation])

  useEffect(() => {
    conversationRevisionRef.current = conversation?.revision ?? 0
  }, [conversation])

  useEffect(() => {
    if (!selectedWorktree) return

    const timeout = setTimeout(() => {
      chatListRef.current?.scrollToEnd({ animated: true })
    }, 50)

    return () => {
      clearTimeout(timeout)
    }
  }, [
    selectedWorktree,
    conversationItems.length,
    conversationItems[conversationItems.length - 1]?.updatedAt,
    pendingActions.length
  ])

  const shortenPath = useCallback(
    (filepath: string): string => {
      if (!homedir || !filepath.startsWith(homedir)) return filepath
      return `~${filepath.slice(homedir.length)}`
    },
    [homedir]
  )

  const refreshSessionState = useCallback(async (
    currentConnection: BridgeConnection,
    worktreePath: string,
    resume = false
  ) => {
    try {
      const [conversationResponse, actionsResponse] = await Promise.all([
        resume
          ? resumeCodexConversation(currentConnection, worktreePath)
          : getCodexConversation(currentConnection, worktreePath),
        getCodexPendingActions(currentConnection, worktreePath)
      ])

      setSessionStatus(conversationResponse.status)
      conversationRevisionRef.current = conversationResponse.snapshot.revision
      setConversation(conversationResponse.snapshot)
      setPendingActions(actionsResponse.actions)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh session'
      if (message.includes('Session not found')) {
        setSessionStatus(null)
        conversationRevisionRef.current = 0
        setConversation(null)
        setPendingActions([])
        return
      }
      throw err
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const restoreConnection = async () => {
      const stored = await loadStoredConnection()
      if (!stored) {
        if (!cancelled) setRestoringConnection(false)
        return
      }

      try {
        await getStatus(stored)
        if (cancelled) return

        setConnection(stored)
        setBaseUrlInput(stored.baseUrl)

        const response = await getWorktrees(stored)
        if (cancelled) return

        setWorktrees(response.worktrees)
        setHomedir(response.homedir ?? null)
      } catch (err) {
        await clearStoredConnection()
        if (cancelled) return

        setConnection(null)
        setWorktrees([])
        setHomedir(null)

        const message = err instanceof Error ? err.message : 'Failed to restore connection'
        setError(isUnauthorizedError(message) ? 'Saved session expired. Please pair again.' : message)
      } finally {
        if (!cancelled) setRestoringConnection(false)
      }
    }

    void restoreConnection()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!connection) {
      setShowAdvanced(false)
    }
  }, [connection])

  useEffect(() => {
    if (!connection || !selectedWorktree) return

    let cancelled = false

    const followConversation = async () => {
      let revision = conversationRevisionRef.current

      while (!cancelled) {
        try {
          const response = await waitForCodexConversationUpdate(connection, selectedWorktree.worktree.path, revision)
          if (cancelled) return
          if (!response.update) continue
          revision = response.update.snapshot.revision
          conversationRevisionRef.current = revision
          setSessionStatus(response.update.status)
          setConversation(response.update.snapshot)
          setPendingActions(response.update.pendingActions)
        } catch {
          if (cancelled) return
          await refreshSessionState(connection, selectedWorktree.worktree.path)
          revision = conversationRevisionRef.current
        }
      }
    }

    void followConversation()
    return () => {
      cancelled = true
    }
  }, [connection, selectedWorktree, refreshSessionState])

  const connectWithCredentials = async (resolvedBaseUrl: string, pairingToken: string) => {
    if (connectInFlightRef.current) return

    connectInFlightRef.current = true
    setLoading(true)
    setError(null)
    try {
      await getHealth(resolvedBaseUrl)
      const exchange = await exchangePairingToken(resolvedBaseUrl, pairingToken)
      const next = { baseUrl: resolvedBaseUrl, sessionToken: exchange.sessionToken }
      await getStatus(next)

      setConnection(next)
      setBaseUrlInput(resolvedBaseUrl)
      setPairingTokenInput('')
      await saveStoredConnection(next)
      await refreshData(next, false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
      setConnection(null)
    } finally {
      setLoading(false)
      connectInFlightRef.current = false
    }
  }

  const connect = async () => {
    const resolved = resolvePairingCredentials(baseUrlInput, pairingTokenInput)
    if (!resolved) return

    await connectWithCredentials(resolved.baseUrl, resolved.token)
  }

  const refreshData = async (current = connection, manageLoading = true) => {
    if (!current) return
    if (manageLoading) {
      setLoading(true)
    }
    setError(null)
    try {
      const response = await getWorktrees(current)
      setWorktrees(response.worktrees)
      setHomedir(response.homedir ?? null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data'
      if (isUnauthorizedError(message)) {
        await clearStoredConnection()
        setConnection(null)
        setWorktrees([])
        setHomedir(null)
        setError('Session expired. Please pair again.')
      } else {
        setError(message)
      }
    } finally {
      if (manageLoading) {
        setLoading(false)
      }
    }
  }

  const disconnect = async () => {
    await clearStoredConnection()
    setConnection(null)
    setWorktrees([])
    setHomedir(null)
    setSelectedWorktree(null)
    setSessionStatus(null)
    conversationRevisionRef.current = 0
    setConversation(null)
    setPendingActions([])
    setPromptInput('')
    setError(null)
  }

  const handleRefresh = async () => {
    if (!connection || loading || refreshing) return

    setRefreshing(true)
    try {
      await refreshData(connection, false)
    } finally {
      setRefreshing(false)
    }
  }

  const openSession = async (item: MobileWorktree) => {
    if (!connection) return
    setSelectedWorktree(item)
    setSessionStatus(null)
    conversationRevisionRef.current = 0
    setConversation(null)
    setPendingActions([])
    setError(null)

    try {
      await refreshSessionState(connection, item.worktree.path, true)
    } catch {
      // No existing session yet.
    }
  }

  const handleStartOrSteer = async () => {
    if (!connection || !selectedWorktree) return
    const prompt = promptInput.trim()
    if (!prompt) return

    setLoading(true)
    setError(null)
    try {
      if (sessionStatus?.running) {
        const response = await steerCodexSession(connection, selectedWorktree.worktree.path, prompt)
        setSessionStatus(response.status)
      } else {
        const response = await startCodexSession(connection, selectedWorktree.worktree.path, prompt)
        setSessionStatus(response.status)
      }
      setPromptInput('')
      await refreshSessionState(connection, selectedWorktree.worktree.path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send prompt')
    } finally {
      setLoading(false)
    }
  }

  const handleInterrupt = async () => {
    if (!connection || !selectedWorktree) return
    setLoading(true)
    setError(null)
    try {
      const response = await interruptCodexSession(connection, selectedWorktree.worktree.path)
      setSessionStatus(response.status)
      await refreshSessionState(connection, selectedWorktree.worktree.path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to interrupt session')
    } finally {
      setLoading(false)
    }
  }

  const handleResolveAction = async (actionId: string, response: string) => {
    if (!connection || !selectedWorktree) return
    setLoading(true)
    setError(null)
    try {
      await respondCodexPendingAction(connection, selectedWorktree.worktree.path, actionId, response)
      await refreshSessionState(connection, selectedWorktree.worktree.path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve action')
    } finally {
      setLoading(false)
    }
  }

  const handleScanQrPress = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission()
      if (!result.granted) {
        setError('Camera permission is required to scan QR codes')
        return
      }
    }
    setScanning(true)
  }

  const handleQrScanned = async (value: string) => {
    await handleScannedPairing(value, {
      connectInFlight: connectInFlightRef.current,
      onInvalid: () => {
        setError('Scanned QR is not a valid Treebeard pairing code')
        setScanning(false)
      },
      onIgnored: () => {
        setScanning(false)
      },
      onPairingParsed: (pairing) => {
        setBaseUrlInput(pairing.url)
        setPairingTokenInput(pairing.token)
        setScanning(false)
      },
      connect: async (pairing) => {
        await connectWithCredentials(pairing.url, pairing.token)
      }
    })
  }

  if (scanning) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.listHeader}>
          <Text style={styles.title}>Scan Pairing QR</Text>
          <Pressable style={styles.secondaryButton} onPress={() => setScanning(false)}>
            <Text style={styles.buttonText}>Cancel</Text>
          </Pressable>
        </View>
        <CameraView
          style={styles.webview}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={(event: { data?: string }) => {
            if (typeof event.data === 'string' && event.data.length > 0) {
              void handleQrScanned(event.data)
            }
          }}
        />
      </SafeAreaView>
    )
  }

  if (restoringConnection) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator color="#58a6ff" />
          <Text style={styles.statusText}>Restoring saved connection...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!connection) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.connectContainer}>
          <Text style={styles.title}>Treebeard Mobile</Text>
          <Text style={styles.subtitle}>Pair with your desktop bridge</Text>

          <Pressable style={styles.secondaryButton} onPress={handleScanQrPress} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Connecting...' : 'Scan QR'}</Text>
          </Pressable>

          <Pressable style={styles.advancedLink} onPress={() => setShowAdvanced((current) => !current)}>
            <Text style={styles.advancedLinkText}>{showAdvanced ? 'Hide advanced' : 'Advanced'}</Text>
          </Pressable>

          {showAdvanced && (
            <View style={styles.advancedContainer}>
              <TextInput
                value={baseUrlInput}
                onChangeText={setBaseUrlInput}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Bridge URL (e.g. http://192.168.1.10:8787)"
                placeholderTextColor="#7d8590"
                style={styles.input}
              />
              <TextInput
                value={pairingTokenInput}
                onChangeText={setPairingTokenInput}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="One-time pairing token or deep link"
                placeholderTextColor="#7d8590"
                style={styles.input}
              />
              <Pressable style={styles.primaryButton} onPress={() => { void connect() }} disabled={loading}>
                <Text style={styles.buttonText}>{loading ? 'Connecting...' : 'Connect manually'}</Text>
              </Pressable>
            </View>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (selectedWorktree) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.webHeader}>
          <Pressable style={styles.secondaryButton} onPress={() => setSelectedWorktree(null)}>
            <Text style={styles.buttonText}>Back</Text>
          </Pressable>
          <Text style={styles.webTitle} numberOfLines={1}>{selectedWorktree.worktree.branch}</Text>
        </View>

        {loading && <ActivityIndicator color="#58a6ff" style={styles.loader} />}
        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.sessionInfo}>
          <Text style={styles.path}>{shortenPath(selectedWorktree.worktree.path)}</Text>
        </View>

        {pendingActions.length > 0 && (
          <View style={styles.pendingActions}>
            <Text style={styles.repoTitle}>Pending actions</Text>
            {pendingActions.map((action) => (
              <View key={action.id} style={styles.pendingCard}>
                <Text style={styles.branch}>{action.prompt}</Text>
                <View style={styles.pendingButtons}>
                  {(action.options.length > 0 ? action.options : ['approve', 'deny']).map((option) => (
                    <Pressable
                      key={`${action.id}-${option}`}
                      style={option.toLowerCase().includes('deny') ? styles.secondaryButton : styles.primaryButton}
                      onPress={() => { void handleResolveAction(action.id, option) }}
                    >
                      <Text style={styles.buttonText}>{option}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        <FlatList
          ref={chatListRef}
          data={conversationItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          style={styles.chatList}
          ListEmptyComponent={<Text style={styles.statusText}>No messages yet. Start with a prompt.</Text>}
          ListFooterComponent={sessionStatus?.running ? (
            <View style={styles.runningIndicator}>
              <ActivityIndicator color="#58a6ff" />
              <Text style={styles.statusText}>Codex is working...</Text>
            </View>
          ) : null}
          renderItem={({ item }) => renderConversationItem(item)}
        />

        <View style={styles.promptRow}>
          <TextInput
            value={promptInput}
            onChangeText={setPromptInput}
            placeholder="Ask Codex..."
            placeholderTextColor="#7d8590"
            style={styles.promptInput}
            multiline
          />
          <Pressable style={styles.primaryButton} onPress={() => { void handleStartOrSteer() }} disabled={loading}>
            <Text style={styles.buttonText}>{sessionStatus?.running ? 'Steer' : 'Start'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => { void handleInterrupt() }} disabled={loading || !sessionStatus?.running}>
            <Text style={styles.buttonText}>Stop</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.listHeader}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Worktrees</Text>
        </View>
        <Pressable
          style={styles.settingsButton}
          onPress={() => { void disconnect() }}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={18} color="#f0f6fc" />
        </Pressable>
      </View>

      {loading && <ActivityIndicator color="#58a6ff" style={styles.loader} />}
      {error && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={grouped}
        keyExtractor={([repo]) => repo}
        onRefresh={() => { void handleRefresh() }}
        refreshing={refreshing}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: [repo, repoWorktrees] }) => (
          <View style={styles.repoSection}>
            <Text style={styles.repoTitle}>{repo}</Text>
            {repoWorktrees.map((entry) => (
              <Pressable
                key={entry.worktree.path}
                style={styles.card}
                onPress={() => { void openSession(entry) }}
                accessibilityRole="button"
                accessibilityLabel={`Open ${entry.worktree.branch}`}
              >
                <Text style={styles.branch}>{entry.worktree.branch}</Text>
                <Text style={styles.path}>{shortenPath(entry.worktree.path)}</Text>
              </Pressable>
            ))}
          </View>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1115'
  },
  connectContainer: {
    padding: 20,
    gap: 12
  },
  title: {
    color: '#f0f6fc',
    fontSize: 24,
    fontWeight: '700'
  },
  subtitle: {
    color: '#9aa4b2',
    marginBottom: 12
  },
  input: {
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f0f6fc'
  },
  promptInput: {
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f0f6fc',
    flex: 1,
    minHeight: 42
  },
  advancedContainer: {
    gap: 10
  },
  advancedLink: {
    alignItems: 'center',
    paddingVertical: 6
  },
  advancedLinkText: {
    color: '#9aa4b2',
    fontSize: 12,
    textDecorationLine: 'underline'
  },
  primaryButton: {
    backgroundColor: '#1f6feb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center'
  },
  secondaryButton: {
    backgroundColor: '#30363d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center'
  },
  settingsButton: {
    backgroundColor: '#30363d',
    borderRadius: 8,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonText: {
    color: '#f0f6fc',
    fontWeight: '600',
    fontSize: 13
  },
  errorText: {
    color: '#ff7b72',
    paddingHorizontal: 12
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  loader: {
    marginBottom: 8
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20
  },
  listContent: {
    padding: 12,
    gap: 12
  },
  repoSection: {
    gap: 8
  },
  repoTitle: {
    color: '#58a6ff',
    fontWeight: '700'
  },
  card: {
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#161b22',
    gap: 6
  },
  branch: {
    color: '#f0f6fc',
    fontWeight: '600'
  },
  path: {
    color: '#9aa4b2',
    fontSize: 12
  },
  statusText: {
    color: '#d2d8de',
    fontSize: 12
  },
  webHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10
  },
  webTitle: {
    color: '#9aa4b2',
    flex: 1,
    fontSize: 12
  },
  webview: {
    flex: 1
  },
  sessionInfo: {
    paddingHorizontal: 12,
    paddingBottom: 6,
    gap: 4
  },
  promptRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'flex-end'
  },
  chatList: {
    flex: 1
  },
  pendingActions: {
    paddingHorizontal: 12,
    gap: 8,
    paddingBottom: 8
  },
  pendingCard: {
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    padding: 10,
    gap: 8,
    backgroundColor: '#161b22'
  },
  pendingButtons: {
    flexDirection: 'row',
    gap: 8
  },
  activityCard: {
    borderWidth: 1,
    borderColor: '#2d333b',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#11161d',
    gap: 6
  },
  activityTitle: {
    color: '#9fb3c8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  runningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 8
  },
  chatBubbleAssistant: {
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#161b22',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '88%'
  },
  chatBubbleUser: {
    borderWidth: 1,
    borderColor: '#1f6feb',
    borderRadius: 10,
    padding: 12,
    backgroundColor: 'rgba(31, 111, 235, 0.18)',
    gap: 6,
    alignSelf: 'flex-end',
    maxWidth: '88%'
  }
})

function renderConversationItem(item: CodexConversationItem) {
  if (item.type === 'user_message' || item.type === 'assistant_message') {
    return (
      <View style={item.type === 'user_message' ? styles.chatBubbleUser : styles.chatBubbleAssistant}>
        <Text style={styles.branch}>{item.text || ' '}</Text>
        <Text style={styles.path}>{formatSessionTime(item.updatedAt)}</Text>
      </View>
    )
  }

  const card = summarizeConversationItem(item)
  if (!card) return null

  return (
    <View style={styles.activityCard}>
      <Text style={styles.activityTitle}>{card.title}</Text>
      <Text style={styles.statusText}>{card.body}</Text>
    </View>
  )
}

function summarizeConversationItem(item: CodexConversationItem): { title: string; body: string } | null {
  if (item.type === 'reasoning') {
    const text = item.summary.join('\n').trim() || item.content.join('\n').trim()
    return text.length > 0 ? { title: 'Reasoning', body: text } : null
  }
  if (item.type === 'plan') {
    return item.text.trim().length > 0 ? { title: 'Plan', body: item.text } : null
  }
  if (item.type === 'command_execution') {
    const details = [
      item.command.trim(),
      item.executionStatus,
      item.exitCode !== null ? `exit ${item.exitCode}` : null
    ].filter((value): value is string => value !== null && value.length > 0)
    return { title: 'Command', body: details.join(' • ') }
  }
  if (item.type === 'file_change') {
    return {
      title: 'File change',
      body: `${item.changeCount} file change${item.changeCount === 1 ? '' : 's'} • ${item.patchStatus}`
    }
  }
  if (item.type === 'mcp_tool_call') {
    const details = [
      `${item.server}:${item.tool}`,
      item.toolStatus,
      item.errorSummary,
      item.resultSummary
    ].filter((value): value is string => value !== null && value.length > 0)
    return { title: 'MCP tool', body: details.join(' • ') }
  }
  if (item.type === 'status') {
    return { title: item.title, body: item.text }
  }
  return null
}
