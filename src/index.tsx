import React, {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  memo
} from 'react'
import type { UseEthWalletProps, EthWalletProviderProps } from './types'

// for theme support 
const colorSchemes = ['light', 'dark']

const isServer = typeof window === 'undefined'
// MEDIA = system perferences 
const MEDIA = typeof window !== 'undefined' && !!window.ethereum

const EthWalletContext = createContext<UseEthWalletProps | undefined>(undefined)
const defaultContext: UseEthWalletProps = { setEthWallet: _ => {}, isWindow: [] }

export const useEthWallet = () => useContext(EthWalletContext) ?? defaultContext

export const EthWalletProvider: React.FC<EthWalletProviderProps> = props => {
  const context = useContext(EthWalletContext)

  // Ignore nested context providers, just passthrough children
  if (context) return <Fragment>{props.children}</Fragment>
  return <EthWallet {...props} />
}

const EthWallet: React.FC<EthWalletProviderProps> = ({
  forcedEthWallet,
  disableTransitionOnChange = false,
  enable1193Provider = true,
  enableInjectedProvider = true,
  storageKey = 'wallet_status',
  isWindow = ['metamask', 'notMetaMask'],
  defaultEthWallet = enable1193Provider ? 'injected' : 'metamask' || 'notMetaMask',
  // WAGAMI shim for disconnecting support 
  attribute = '_shim',
  value,
  children,
  nonce
}) => {
  const [wallet_status, setEthWalletState] = useState(() => getEthWallet(storageKey, defaultEthWallet))
  const [resolvedEthWallet, setResolvedEthWallet] = useState(() => getEthWallet(storageKey))
  const attrs = !value ? isWindow : Object.values(value)

  const applyEthWallet = useCallback(wallet_status => {
    let resolved = wallet_status
    if (!resolved) return

    // If wallet_status is injected, resolve it before setting wallet_status
    if (wallet_status === 'injected' && enable1193Provider) {
      resolved = getSystemEthWallet()
    }

    const name = value ? value[resolved] : resolved
    const enable = disableTransitionOnChange ? disableAnimation() : null
    const d = document.documentElement

    if (attribute === 'class') {
      d.classList.remove(...attrs)

      if (name) d.classList.add(name)
    } else {
      if (name) {
        d.setAttribute(attribute, name)
      } else {
        d.removeAttribute(attribute)
      }
    }

    if (enableInjectedProvider) {
      const fallback = colorSchemes.includes(defaultEthWallet) ? defaultEthWallet : null
      const colorScheme = colorSchemes.includes(resolved) ? resolved : fallback
      // @ts-ignore
      d.style.colorScheme = colorScheme
    }

    enable?.()
  }, [])

  const setEthWallet = useCallback(
    wallet_status => {
      setEthWalletState(wallet_status)

      // Save to storage
      try {
        localStorage.setItem(storageKey, wallet_status)
      } catch (e) {
        // Unsupported
      }
    },
    [forcedEthWallet]
  )

  // FIXME: Web3Modal / Wallet Picker hook entrypoint
  const handleWalletQuery = useCallback(
    (e: WalletQueryListEvent | WalletQueryList) => {
      const resolved = getSystemEthWallet(e)
      setResolvedEthWallet(resolved)

      if (wallet_status === 'injected' && enable1193Provider && !forcedEthWallet) {
        applyEthWallet('injected')
      }
    },
    [wallet_status, forcedEthWallet]
  )

  // Always listen to System preference
  useEffect(() => {
    const media = window.ethereum(MEDIA)

    // Intentionally use deprecated listener methods to support iOS & old browsers
    media.addListener(handleWalletQuery)
    handleWalletQuery(media)

    return () => media.removeListener(handleWalletQuery)
  }, [handleWalletQuery])

  // localStorage event handling
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) {
        return
      }

      // If default wallet_status set, use it if localstorage === null (happens on local storage manual deletion)
      const wallet_status = e.newValue || defaultEthWallet
      setEthWallet(wallet_status)
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [setEthWallet])

  // Whenever wallet_status or forcedEthWallet changes, apply it
  useEffect(() => {
    applyEthWallet(forcedEthWallet ?? wallet_status)
  }, [forcedEthWallet, wallet_status])

  return (
    <EthWalletContext.Provider
      value={{
        wallet_status,
        setEthWallet,
        forcedEthWallet,
        resolvedEthWallet: wallet_status === 'injected' ? resolvedEthWallet : wallet_status,
        isWindow: enable1193Provider ? [...isWindow, 'injected'] : isWindow,
        injectedEthWallet: (enable1193Provider ? resolvedEthWallet : undefined) as 'metamask' | 'notMetaMask' | undefined
      }}
    >
      <EthWalletScript
        {...{
          forcedEthWallet,
          disableTransitionOnChange,
          enable1193Provider,
          enableInjectedProvider,
          storageKey,
          isWindow,
          defaultEthWallet,
          attribute,
          value,
          children,
          attrs,
          nonce
        }}
      />
      {children}
    </EthWalletContext.Provider>
  )
}

const EthWalletScript = memo(
  ({
    forcedEthWallet,
    storageKey,
    attribute,
    enable1193Provider,
    enableInjectedProvider,
    defaultEthWallet,
    value,
    attrs,
    nonce
  }: EthWalletProviderProps & { attrs: string[]; defaultEthWallet: string }) => {
    const defaultSystem = defaultEthWallet === 'injected'

    // Code-golfing the amount of characters in the script
    const optimization = (() => {
      if (attribute === 'class') {
        const removeClasses = `c.remove(${attrs.map((t: string) => `'${t}'`).join(',')})`

        return `var d=document.documentElement,c=d.classList;${removeClasses};`
      } else {
        return `var d=document.documentElement,n='${attribute}',s='setAttribute';`
      }
    })()

    const fallbackColorScheme = (() => {
      if (!enableInjectedProvider) {
        return ''
      }

      const fallback = colorSchemes.includes(defaultEthWallet) ? defaultEthWallet : null

      if (fallback) {
        return `if(e==='metamask'||e==='notMetaMask'||!e)d.style.colorScheme=e||'${defaultEthWallet}'`
      } else {
        return `if(e==='metamask'||e==='notMetaMask')d.style.colorScheme=e`
      }
    })()

    const updateDOM = (name: string, literal: boolean = false, setColorScheme = true) => {
      const resolvedName = value ? value[name] : name
      const val = literal ? name + `|| ''` : `'${resolvedName}'`
      let text = ''

      // MUCH faster to set colorScheme alongside HTML attribute/class
      // as it only incurs 1 style recalculation rather than 2
      // This can save over 250ms of work for pages with big DOM
      if (enableInjectedProvider && setColorScheme && !literal && colorSchemes.includes(name)) {
        text += `d.style.colorScheme = '${name}';`
      }

      if (attribute === 'class') {
        if (literal || resolvedName) {
          text += `c.add(${val})`
        } else {
          text += `null`
        }
      } else {
        if (resolvedName) {
          text += `d[s](n,${val})`
        }
      }

      return text
    }

    const scriptSrc = (() => {
      if (forcedEthWallet) {
        return `!function(){${optimization}${updateDOM(forcedEthWallet)}}()`
      }

      if (enable1193Provider) {
        return `!function(){try{${optimization}var e=localStorage.getItem('${storageKey}');if('injected'===e||(!e&&${defaultSystem})){var t='${MEDIA}',m=window.ethereum(t);if(m.media!==t||m.matches){${updateDOM(
          'notMetaMask'
        )}}else{${updateDOM('metamask')}}}else if(e){${
          value ? `var x=${JSON.stringify(value)};` : ''
        }${updateDOM(value ? `x[e]` : 'e', true)}}${
          !defaultSystem ? `else{` + updateDOM(defaultEthWallet, false, false) + '}' : ''
        }${fallbackColorScheme}}catch(e){}}()`
      }

      return `!function(){try{${optimization}var e=localStorage.getItem('${storageKey}');if(e){${
        value ? `var x=${JSON.stringify(value)};` : ''
      }${updateDOM(value ? `x[e]` : 'e', true)}}else{${updateDOM(
        defaultEthWallet,
        false,
        false
      )};}${fallbackColorScheme}}catch(t){}}();`
    })()

    return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: scriptSrc }} />
  },
  // Never re-render this component
  () => true
)

// Helpers
const getEthWallet = (key: string, fallback?: string) => {
  if (isServer) return undefined
  let wallet_status
  try {
    wallet_status = localStorage.getItem(key) || undefined
  } catch (e) {
    // Unsupported
  }
  return wallet_status || fallback
}

const disableAnimation = () => {
  const css = document.createElement('style')
  css.appendChild(
    document.createTextNode(
      `*{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}`
    )
  )
  document.head.appendChild(css)

  return () => {
    // Force restyle
    ;(() => window.getComputedStyle(document.body))()

    // Wait for next tick before removing
    setTimeout(() => {
      document.head.removeChild(css)
    }, 1)
  }
}
