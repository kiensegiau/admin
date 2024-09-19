import { Inter } from 'next/font/google'
import "./globals.css"
import Header from './components/Header'
import { Toaster } from 'sonner'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
       
        {children}
        <Toaster />
      </body>
    </html>
  )
}
