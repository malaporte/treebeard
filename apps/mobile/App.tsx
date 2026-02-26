import { useMemo, useState } from 'react'
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
import { exchangePairingToken, getHealth, getStatus, getWorktrees, setOpencodeEnabled } from './src/api'
import type { BridgeConnection } from './src/api'
import type { MobileWorktree } from './src/types'

interface ParsedPairingInput {
  url: string
  token: string
}

function parsePairingInput(input: string): ParsedPairingInput | null {
  if (!input.startsWith('treebeard://pair?')) return null
  try {
    const query = input.slice('treebeard://pair?'.length)
    const params = new URLSearchParams(query)
    const encodedData = params.get('data')
    if (!encodedData) return null

    const decoded = decodeURIComponent(encodedData)
    const payload = JSON.parse(decoded) as { url?: string; token?: string }
    if (typeof payload.url !== 'string' || typeof payload.token !== 'string') return null

    return {
      url: payload.url,
      token: payload.token
    }
  } catch {
    return null
  }
}

function resolveOpencodeUrlForMobile(rawUrl: string, bridgeBaseUrl: string): string {
  try {
    const bridgeUrl = new URL(bridgeBaseUrl)
    const opencodeUrl = new URL(rawUrl)
    if (
      opencodeUrl.hostname === '127.0.0.1' ||
      opencodeUrl.hostname === 'localhost' ||
      opencodeUrl.hostname === '0.0.0.0'
    ) {
      opencodeUrl.hostname = bridgeUrl.hostname
    }
    return opencodeUrl.toString()
  } catch {
    return rawUrl
  }
}

export default function App() {
  const [baseUrlInput, setBaseUrlInput] = useState('http://192.168.1.10:8787')
  const [pairingTokenInput, setPairingTokenInput] = useState('')
  const [connection, setConnection] = useState<BridgeConnection | null>(null)
  const [worktrees, setWorktrees] = useState<MobileWorktree[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeWebUrl, setActiveWebUrl] = useState<string | null>(null)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [scanning, setScanning] = useState(false)

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

  const connect = async () => {
    const baseUrl = baseUrlInput.trim().replace(/\/$/, '')
    const rawTokenInput = pairingTokenInput.trim()
    if (!baseUrl || !rawTokenInput) return

    const pairing = parsePairingInput(rawTokenInput)
    const resolvedBaseUrl = pairing?.url || baseUrl
    const pairingToken = pairing?.token || rawTokenInput

    setLoading(true)
    setError(null)
    try {
      await getHealth(resolvedBaseUrl)
      const exchange = await exchangePairingToken(resolvedBaseUrl, pairingToken)
      const next = { baseUrl: resolvedBaseUrl, sessionToken: exchange.sessionToken }
      await getStatus(next)
      setConnection(next)
      setBaseUrlInput(resolvedBaseUrl)
      await refreshWorktrees(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
      setConnection(null)
    } finally {
      setLoading(false)
    }
  }

  const refreshWorktrees = async (current = connection) => {
    if (!current) return
    setLoading(true)
    setError(null)
    try {
      const response = await getWorktrees(current)
      setWorktrees(response.worktrees)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch worktrees')
    } finally {
      setLoading(false)
    }
  }

  const toggleOpencode = async (item: MobileWorktree) => {
    if (!connection) return
    setLoading(true)
    setError(null)
    try {
      await setOpencodeEnabled(connection, item.worktree.path, !item.opencode.enabled)
      await refreshWorktrees(connection)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle OpenCode server')
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

  const handleQrScanned = (value: string) => {
    const pairing = parsePairingInput(value)
    if (!pairing) {
      setError('Scanned QR is not a valid Treebeard pairing code')
      setScanning(false)
      return
    }

    setBaseUrlInput(pairing.url)
    setPairingTokenInput(pairing.token)
    setScanning(false)
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
              handleQrScanned(event.data)
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

  if (!connection) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.connectContainer}>
          <Text style={styles.title}>Treebeard Mobile</Text>
          <Text style={styles.subtitle}>Pair with your desktop bridge</Text>

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

          <Pressable style={styles.primaryButton} onPress={connect} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Connecting...' : 'Connect'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={handleScanQrPress} disabled={loading}>
            <Text style={styles.buttonText}>Scan QR</Text>
          </Pressable>

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
          <Pressable style={styles.secondaryButton} onPress={() => { setConnection(null); setWorktrees([]) }}>
            <Text style={styles.buttonText}>Disconnect</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => refreshWorktrees()} disabled={loading}>
            <Text style={styles.buttonText}>Refresh</Text>
          </Pressable>
        </View>
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
                <Text style={styles.statusText}>
                  {entry.opencode.running ? `OpenCode: running (${entry.opencode.url || 'url unavailable'})` : 'OpenCode: stopped'}
                </Text>
                {entry.opencode.error ? <Text style={styles.errorText}>{entry.opencode.error}</Text> : null}
                <View style={styles.cardButtons}>
                  <Pressable style={styles.secondaryButton} onPress={() => toggleOpencode(entry)}>
                    <Text style={styles.buttonText}>{entry.opencode.enabled ? 'Disable server' : 'Enable server'}</Text>
                  </Pressable>
                  <Pressable
                    style={entry.opencode.url ? styles.primaryButton : styles.disabledButton}
                    onPress={() => {
                      if (entry.opencode.url && connection) {
                        setActiveWebUrl(resolveOpencodeUrlForMobile(entry.opencode.url, connection.baseUrl))
                      }
                    }}
                    disabled={!entry.opencode.url}
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
  headerButtons: {
    flexDirection: 'row',
    gap: 8
  },
  loader: {
    marginBottom: 8
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
