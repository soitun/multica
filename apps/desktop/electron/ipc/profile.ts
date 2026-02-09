/**
 * Profile IPC handlers for Electron main process.
 *
 * Manages agent profile settings like name and user.md content.
 */
import { ipcMain } from 'electron'
import { getCurrentHub } from './hub.js'

/**
 * Get the default agent from Hub.
 */
function getDefaultAgent() {
  const hub = getCurrentHub()
  if (!hub) return null

  const agentIds = hub.listAgents()
  if (agentIds.length === 0) return null

  return hub.getAgent(agentIds[0]) ?? null
}

/**
 * Profile data returned to renderer.
 */
export interface ProfileData {
  profileId: string | undefined
  name: string | undefined
  userContent: string | undefined
}

/**
 * Register all Profile-related IPC handlers.
 */
export function registerProfileIpcHandlers(): void {
  /**
   * Get profile data (name + user content).
   */
  ipcMain.handle('profile:get', async (): Promise<ProfileData> => {
    const agent = getDefaultAgent()
    if (!agent) {
      return {
        profileId: undefined,
        name: undefined,
        userContent: undefined,
      }
    }

    return {
      profileId: agent.getProfileId(),
      name: agent.getAgentName(),
      userContent: agent.getUserContent(),
    }
  })

  /**
   * Update agent display name.
   */
  ipcMain.handle('profile:updateName', async (_event, name: string) => {
    const agent = getDefaultAgent()
    if (!agent) {
      return { error: 'No agent available' }
    }

    agent.setAgentName(name)
    return { ok: true, name }
  })

  /**
   * Update user.md content.
   */
  ipcMain.handle('profile:updateUser', async (_event, content: string) => {
    const agent = getDefaultAgent()
    if (!agent) {
      console.error('[Profile IPC] No agent available for updateUser')
      return { error: 'No agent available' }
    }

    console.log('[Profile IPC] Updating user content:', content.substring(0, 50) + '...')
    agent.setUserContent(content)

    // Reload system prompt to apply changes immediately
    console.log('[Profile IPC] Reloading system prompt...')
    agent.reloadSystemPrompt()

    // Verify the change
    const newUserContent = agent.getUserContent()
    console.log('[Profile IPC] New user content:', newUserContent?.substring(0, 50) + '...')

    return { ok: true }
  })

}
