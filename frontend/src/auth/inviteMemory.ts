let inviteTokenMemory = "";

export function rememberInviteToken(token: string): void {
  if (token !== "") {
    inviteTokenMemory = token;
  }
}

export function currentInviteToken(): string {
  return inviteTokenMemory;
}

export function forgetInviteToken(): void {
  inviteTokenMemory = "";
}
