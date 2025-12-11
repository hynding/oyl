import { useNavigate } from "react-router"

export const useNavigation = () => {
  const navigate = useNavigate()

  const to = (path: string) => {
    navigate(path)
  }

  return { to }
}