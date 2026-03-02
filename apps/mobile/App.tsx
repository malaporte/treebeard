import { useEffect, useMemo, useRef, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
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
import { WebView } from 'react-native-webview'
import {
  createOpencodeWebSession,
  exchangePairingToken,
  getHealth,
  getStatus,
  getWorktrees
} from './src/api'
import { handleScannedPairing, resolvePairingCredentials } from './src/pairing'
import type { BridgeConnection } from './src/api'
import type { MobileWorktree, OpencodeServerStatus } from './src/types'

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

export default function App() {
  const [baseUrlInput, setBaseUrlInput] = useState('http://192.168.1.10:8787')
  const [pairingTokenInput, setPairingTokenInput] = useState('')
  const [connection, setConnection] = useState<BridgeConnection | null>(null)
  const [worktrees, setWorktrees] = useState<MobileWorktree[]>([])
  const [opencodeStatus, setOpencodeStatus] = useState<OpencodeServerStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeWebUrl, setActiveWebUrl] = useState<string | null>(null)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [scanning, setScanning] = useState(false)
  const [restoringConnection, setRestoringConnection] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const connectInFlightRef = useRef(false)

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
        setOpencodeStatus(response.opencode)
      } catch (err) {
        await clearStoredConnection()
        if (cancelled) return

        setConnection(null)
        setWorktrees([])
        setOpencodeStatus(null)

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
      setOpencodeStatus(response.opencode)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data'
      if (isUnauthorizedError(message)) {
        await clearStoredConnection()
        setConnection(null)
        setWorktrees([])
        setOpencodeStatus(null)
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
    setOpencodeStatus(null)
    setActiveWebUrl(null)
    setError(null)
  }

  const openOpencodeUi = async (item: MobileWorktree) => {
    if (!connection) return
    setLoading(true)
    setError(null)
    try {
      const session = await createOpencodeWebSession(connection, item.worktree.path)
      setActiveWebUrl(session.webUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open OpenCode UI')
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

  if (activeWebUrl) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.webHeader}>
          <Pressable style={styles.secondaryButton} onPress={() => setActiveWebUrl(null)}>
            <Text style={styles.buttonText}>Back to list</Text>
          </Pressable>
          <Text style={styles.webTitle} numberOfLines={1}>{activeWebUrl}</Text>
        </View>
        <WebView source={{ uri: activeWebUrl }} style={styles.webview} />
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.listHeader}>
        <Text style={styles.title}>Worktrees</Text>
        <View style={styles.headerButtons}>
          <Pressable style={styles.secondaryButton} onPress={() => { void disconnect() }}>
            <Text style={styles.buttonText}>Disconnect</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => refreshData()} disabled={loading}>
            <Text style={styles.buttonText}>Refresh</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.serverRow}>
        <Text style={styles.statusText}>
          {opencodeStatus?.running
            ? `OpenCode: running (${opencodeStatus.url || 'url unavailable'})`
            : 'OpenCode: stopped'}
        </Text>
      </View>

      {loading && <ActivityIndicator color="#58a6ff" style={styles.loader} />}
      {error && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={grouped}
        keyExtractor={([repo]) => repo}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: [repo, repoWorktrees] }) => (
          <View style={styles.repoSection}>
            <Text style={styles.repoTitle}>{repo}</Text>
            {repoWorktrees.map((entry) => (
              <View key={entry.worktree.path} style={styles.card}>
                <Text style={styles.branch}>{entry.worktree.branch}</Text>
                <Text style={styles.path}>{entry.worktree.path}</Text>
                <View style={styles.cardButtons}>
                  <Pressable
                    style={opencodeStatus?.url ? styles.primaryButton : styles.disabledButton}
                    onPress={() => openOpencodeUi(entry)}
                    disabled={!opencodeStatus?.url}
                  >
                    <Text style={styles.buttonText}>Open UI</Text>
                  </Pressable>
                </View>
              </View>
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
  disabledButton: {
    backgroundColor: '#21262d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    opacity: 0.6
  },
  buttonText: {
    color: '#f0f6fc',
    fontWeight: '600',
    fontSize: 13
  },
  errorText: {
    color: '#ff7b72'
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  serverRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center'
  },
  headerButtons: {
    flexDirection: 'row',
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
  cardButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4
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
  }
})
