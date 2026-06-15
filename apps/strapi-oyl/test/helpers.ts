/** Register a users-permissions user and return its JWT + id (public role has register by default). */
export async function registerUser(baseUrl: string, username: string): Promise<{ jwt: string; userId: number }> {
  const res = await fetch(`${baseUrl}/auth/local/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@test.dev`, password: 'Password123!' }),
  })
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { jwt: string; user: { id: number } }
  return { jwt: body.jwt, userId: body.user.id }
}
