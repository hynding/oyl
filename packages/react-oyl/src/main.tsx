import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from "react-router"
import AppHomePage from '@/modules/app/AppHomePage'
import AppProvider from '@/modules/app/AppProvider'
import AuthLogin from '@/modules/auth/AuthLogin'
import ProtectedRoute from '@/modules/auth/ProtectedRoute'
import UserDailyPage from '@/modules/user/daily/UserDailyPage'
import UserProfilePage from '@/modules/user/profile/UserProfilePage'
import NutritionPage from '@/modules/nutrition/NutritionPage'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <Routes >
          <Route path="login" element={<AuthLogin />} />
          <Route index element={<ProtectedRoute><AppHomePage /></ProtectedRoute>} />
          <Route path="daily" element={<ProtectedRoute><UserDailyPage /></ProtectedRoute>} />
          <Route path="my/:settings" element={<ProtectedRoute><UserProfilePage /></ProtectedRoute>} />
          <Route path="nutrition" element={<ProtectedRoute><NutritionPage /></ProtectedRoute>} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
)
