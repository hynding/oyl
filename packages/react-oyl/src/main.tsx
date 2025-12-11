import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from "react-router"
import AppHomePage from '@/modules/app/AppHomePage'
import AppProvider from '@/modules/app/AppProvider'
import AuthLogin from '@/modules/auth/AuthLogin'
import UserDailyPage from '@/modules/user/daily/UserDailyPage'
import UserProfilePage from '@/modules/user/profile/UserProfilePage'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <Routes >
          <Route index element={<AppHomePage />} />
          <Route path="daily" element={<UserDailyPage />} />
          <Route path="login" element={<AuthLogin />} />
          <Route path="my/:settings" element={<UserProfilePage />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
)
