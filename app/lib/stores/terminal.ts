import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import { atom, type WritableAtom } from 'nanostores';
import { restartWebContainer } from '~/lib/webcontainer';
import type { ITerminal } from '~/types/terminal';
import { newBoltShellProcess, newShellProcess } from '~/utils/shell';
import { coloredText } from '~/utils/terminal';

export class TerminalStore {
  #getWebcontainer: () => Promise<WebContainer>;
  #terminals: Array<{ terminal: ITerminal; process: WebContainerProcess }> = [];
  #boltTerminal = newBoltShellProcess();

  showTerminal: WritableAtom<boolean> = import.meta.hot?.data.showTerminal ?? atom(true);

  constructor(getWebcontainer: () => Promise<WebContainer>) {
    this.#getWebcontainer = getWebcontainer;

    if (import.meta.hot) {
      import.meta.hot.data.showTerminal = this.showTerminal;
    }
  }
  get boltTerminal() {
    return this.#boltTerminal;
  }

  toggleTerminal(value?: boolean) {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }

  #isReleasedProxyError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /proxy has been released/i.test(message) || /not useable/i.test(message);
  }

  async attachBoltTerminal(terminal: ITerminal) {
    try {
      const wc = await this.#getWebcontainer();
      await this.#boltTerminal.init(wc, terminal);
    } catch (error: any) {
      if (this.#isReleasedProxyError(error)) {
        try {
          terminal.write(coloredText.yellow('WebContainer proxy was released, restarting runtime...\n'));
          const wc = await restartWebContainer();
          this.#boltTerminal = newBoltShellProcess();
          await this.#boltTerminal.init(wc, terminal);
          terminal.write(coloredText.green('Recovered Bolt shell after WebContainer restart.\n'));
          return;
        } catch (restartError: any) {
          terminal.write(
            coloredText.red('Failed to recover bolt shell after WebContainer restart\n\n') + restartError.message,
          );
          return;
        }
      }

      terminal.write(coloredText.red('Failed to spawn bolt shell\n\n') + error.message);
      return;
    }
  }

  async attachTerminal(terminal: ITerminal) {
    try {
      const shellProcess = await newShellProcess(await this.#getWebcontainer(), terminal);
      this.#terminals.push({ terminal, process: shellProcess });
    } catch (error: any) {
      terminal.write(coloredText.red('Failed to spawn shell\n\n') + error.message);
      return;
    }
  }

  onTerminalResize(cols: number, rows: number) {
    for (const { process } of this.#terminals) {
      process.resize({ cols, rows });
    }
  }

  async detachTerminal(terminal: ITerminal) {
    const terminalIndex = this.#terminals.findIndex((t) => t.terminal === terminal);

    if (terminalIndex !== -1) {
      const { process } = this.#terminals[terminalIndex];

      try {
        process.kill();
      } catch (error) {
        console.warn('Failed to kill terminal process:', error);
      }
      this.#terminals.splice(terminalIndex, 1);
    }
  }
}
