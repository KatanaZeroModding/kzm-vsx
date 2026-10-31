import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function cli(): string {
  return vscode.workspace.getConfiguration("kzm").get<string>("cliPath") || "kzm";
}

function repoRoot(): string | undefined {
  return (
    vscode.workspace.getConfiguration("kzm").get<string>("repoRoot") ||
    process.env.KZM_REPO_ROOT ||
    undefined
  );
}

function modRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function runKzm(args: string, cwd?: string, silent = false): Promise<string> {
  const root = repoRoot();
  const env = { ...process.env };
  if (root) {
    env.KZM_REPO_ROOT = root;
  }
  const cmd = `"${cli()}" ${args}`;
  if (!silent) {
    const term = vscode.window.createTerminal({ name: "KZM", cwd, env });
    term.show();
    term.sendText(cmd);
    return "";
  }
  const { stdout, stderr } = await execAsync(cmd, { cwd, env, windowsHide: true });
  return (stdout || stderr || "").trim();
}

export function activate(context: vscode.ExtensionContext) {
  const buildMod = async (silent: boolean) => {
    const cwd = modRoot();
    if (!cwd) {
      vscode.window.showErrorMessage("Open your mod folder in VS Code.");
      return;
    }
    try {
      if (silent) {
        await runKzm("build", cwd, true);
      } else {
        await runKzm("build", cwd, false);
      }
      vscode.window.showInformationMessage(
        "KZM: mod built and installed — open KZM Launcher and press Play."
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`KZM build failed: ${msg}`);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("kzm.initMod", async () => {
      const name = await vscode.window.showInputBox({ prompt: "Mod folder name" });
      if (name) await runKzm(`init ${name}`);
    }),
    vscode.commands.registerCommand("kzm.newPlugin", async () => {
      const name = await vscode.window.showInputBox({ prompt: "Plugin name" });
      if (name) await runKzm(`plugin new ${name}`, modRoot());
    }),
    vscode.commands.registerCommand("kzm.build", () => buildMod(false)),
    vscode.commands.registerCommand("kzm.buildQuiet", () => buildMod(true)),
    vscode.commands.registerCommand("kzm.pack", () => runKzm("pack", modRoot())),
    vscode.commands.registerCommand("kzm.devLink", () =>
      runKzm("build", modRoot())
    )
  );

  if (vscode.workspace.getConfiguration("kzm").get<boolean>("buildOnSave")) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(async (doc) => {
        if (!modRoot()) return;
        if (!doc.uri.fsPath.includes(modRoot()!)) return;
        if (!doc.uri.fsPath.endsWith(".lua") && doc.fileName !== "mod.toml") return;
        await buildMod(true);
      })
    );
  }
}

export function deactivate() {}
