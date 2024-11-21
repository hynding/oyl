import { 
    FunctionComponent, 
    ReactNode,
    createContext,
    useState
} from 'react'

interface IAuthProvider {
    isAuthenticated: boolean
    username: string | null
    token: string | null
    signin(username: string, password: string): Promise<void>
    signout(): Promise<void>
}

type Props = {
    children: ReactNode
}

export const AuthContext = createContext<IAuthProvider | null>(null)

/**
 * This represents some generic auth provider API, like Firebase.
 */
export const AuthProvider: FunctionComponent<Props> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)

  const signin = async (username: string) => {
    setIsAuthenticated(true)
    setUsername(username)
    setToken('temp-token')
  }

  const signout = async () => {
    setIsAuthenticated(false)
    setUsername(null)
  }

  return (
      <AuthContext.Provider value={{ isAuthenticated, username, token, signin, signout }}>
          {children}
      </AuthContext.Provider>
  )

}