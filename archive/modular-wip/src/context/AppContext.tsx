import React, { createContext, useContext, useEffect, useReducer } from 'react'
import {
  loadAllData,
  saveQuotes,
  saveInvoices,
  saveTimesheets,
  saveProfiles,
  saveSettings,
} from '@/services/storage'
import type { Quote, Invoice, Timesheet, CrewProfile, UserSettings, AppState } from '@/types'

// ── Action Types ───────────────────────────────────────────────────────────

type Action =
  | { type: 'INIT';              payload: Omit<AppState, 'initialized'> }
  | { type: 'SET_QUOTES';        payload: Quote[]        }
  | { type: 'SET_INVOICES';      payload: Invoice[]      }
  | { type: 'SET_TIMESHEETS';    payload: Timesheet[]    }
  | { type: 'SET_PROFILES';      payload: CrewProfile[]  }
  | { type: 'SET_SETTINGS';      payload: UserSettings   }

// ── Reducer ────────────────────────────────────────────────────────────────

const initialState: AppState = {
  quotes:      [],
  invoices:    [],
  timesheets:  [],
  profiles:    [],
  settings:    {} as UserSettings,
  initialized: false,
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'INIT':
      return { ...state, ...action.payload, initialized: true }
    case 'SET_QUOTES':
      return { ...state, quotes: action.payload }
    case 'SET_INVOICES':
      return { ...state, invoices: action.payload }
    case 'SET_TIMESHEETS':
      return { ...state, timesheets: action.payload }
    case 'SET_PROFILES':
      return { ...state, profiles: action.payload }
    case 'SET_SETTINGS':
      return { ...state, settings: action.payload }
    default:
      return state
  }
}

// ── Context ────────────────────────────────────────────────────────────────

interface AppContextValue extends AppState {
  updateQuotes:     (quotes:     Quote[])       => void
  updateInvoices:   (invoices:   Invoice[])     => void
  updateTimesheets: (timesheets: Timesheet[])   => void
  updateProfiles:   (profiles:   CrewProfile[]) => void
  updateSettings:   (settings:   UserSettings)  => void
}

const AppContext = createContext<AppContextValue | null>(null)

// ── Provider ───────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Load persisted data on mount
  useEffect(() => {
    const data = loadAllData()
    dispatch({ type: 'INIT', payload: data })
  }, [])

  const updateQuotes = (quotes: Quote[]) => {
    dispatch({ type: 'SET_QUOTES', payload: quotes })
    saveQuotes(quotes)
  }

  const updateInvoices = (invoices: Invoice[]) => {
    dispatch({ type: 'SET_INVOICES', payload: invoices })
    saveInvoices(invoices)
  }

  const updateTimesheets = (timesheets: Timesheet[]) => {
    dispatch({ type: 'SET_TIMESHEETS', payload: timesheets })
    saveTimesheets(timesheets)
  }

  const updateProfiles = (profiles: CrewProfile[]) => {
    dispatch({ type: 'SET_PROFILES', payload: profiles })
    saveProfiles(profiles)
  }

  const updateSettings = (settings: UserSettings) => {
    dispatch({ type: 'SET_SETTINGS', payload: settings })
    saveSettings(settings)
  }

  return (
    <AppContext.Provider value={{ ...state, updateQuotes, updateInvoices, updateTimesheets, updateProfiles, updateSettings }}>
      {children}
    </AppContext.Provider>
  )
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
