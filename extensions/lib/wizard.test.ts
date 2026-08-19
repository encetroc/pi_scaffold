import { execFile } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { INITIAL_COMMIT_MESSAGE } from "../../src/engine/index.js";

import {
  completeArgs,
  listStacks,
  nextSteps,
  runWizard,
  WizardCancelled,
  type WizardUi,
} from "./wizard.js";

const execFileAsync = promisify(execFile);
async function exec(
  cmd: string,
  args: string[],
  cwd?: string,
): Promise<{ stdout: string }> {
  const { stdout } = await execFileAsync(cmd, args, cwd ? { cwd } : {});
  return { stdout };
}

let tempRoot: string;
const tempDirs: string[] = [];

beforeEach(() => {
  tempRoot = makeTempRoot();
  tempDirs.push(tempRoot);
  process.env.GIT_AUTHOR_NAME = "Scafstak Test";
  process.env.GIT_AUTHOR_EMAIL = "test@example.com";
  process.env.GIT_COMMITTER_NAME = "Scafstak Test";
  process.env.GIT_COMMITTER_EMAIL = "test@example.com";
});

function makeTempRoot(): string {
  return `${tmpdir()}/scafstak-wizard-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

/** Write a minimal template at templatesDir/<stack>/<version>. */
async function writeTemplate(
  templatesDir: string,
  stack = "demo",
  version = "1",
): Promise<void> {
  const root = join(templatesDir, stack, version);
  await mkdir(join(root, "files"), { recursive: true });
  await writeFile(
    join(root, "manifest.json"),
    JSON.stringify({
      name: `${stack}-${version}`,
      stack,
      frameworkVersion: version,
      language: "rs",
      questions: [
        {
          id: "window_title",
          label: "Window title",
          default: "{{project_name}}",
        },
        {
          id: "crate_name",
          label: "Crate name",
          default: "{{project_name_snake}}",
        },
      ],
      variables: { project_name_snake: "{{project_name}} -> snake_case" },
      commands: { run: "./scripts/run.sh" },
    }),
  );
  await writeFile(
    join(root, "getting-started.md"),
    "# Setup\n\nDemo setup text.\n",
  );
  await writeFile(
    join(root, "files", "welcome.txt"),
    "{{project_name}} {{window_title}} {{crate_name}}\n",
  );
}

class ScriptedUi implements WizardUi {
  index = 0;
  constructor(private readonly script: Array<string | undefined>) {}
  async select(): Promise<string | undefined> {
    return this.script[this.index++] ?? undefined;
  }
  async input(): Promise<string | undefined> {
    return this.script[this.index++] ?? undefined;
  }
  async confirm(): Promise<boolean> {
    return (this.script[this.index++] ?? "0") === "yes";
  }
}

describe("listStacks", () => {
  it("discovers stack versions", async () => {
    const dir = join(tempRoot, "templates");
    await writeTemplate(dir, "a", "1");
    await writeTemplate(dir, "a", "2");
    await writeTemplate(dir, "b", "1");

    const stacks = await listStacks(dir);
    expect(stacks).toEqual([
      { stack: "a", versions: ["1", "2"] },
      { stack: "b", versions: ["1"] },
    ]);
  });

  it("returns empty for an empty templates dir", async () => {
    const dir = join(tempRoot, "empty");
    await mkdir(dir, { recursive: true });
    expect(await listStacks(dir)).toEqual([]);
  });
});

describe("completeArgs", () => {
  let dir: string;
  beforeEach(async () => {
    dir = join(tempRoot, "templates");
    await writeTemplate(dir, "bevy", "0.19");
    await writeTemplate(dir, "bevy", "0.18");
    await writeTemplate(dir, "phaser", "4");
  });

  it("offers stacks for the first argument", async () => {
    const items = await completeArgs(dir, "");
    expect(items?.map((i) => i.value)).toEqual(["bevy", "phaser"]);
  });

  it("filters stacks mid-word", async () => {
    const items = await completeArgs(dir, "be");
    expect(items?.map((i) => i.value)).toEqual(["bevy"]);
  });

  it("offers new-stack as an authoring subcommand mid-word", async () => {
    const items = await completeArgs(dir, "new");
    expect(items?.map((i) => i.value)).toEqual(["new-stack"]);
  });

  it("offers versions of the chosen stack after a space", async () => {
    const items = await completeArgs(dir, "bevy ");
    expect(items?.map((i) => ({ value: i.value, label: i.label }))).toEqual([
      { value: "bevy 0.18", label: "0.18" },
      { value: "bevy 0.19", label: "0.19" },
    ]);
  });

  it("filters versions mid-word with the stack prefix kept", async () => {
    const items = await completeArgs(dir, "bevy 0.19");
    expect(items?.map((i) => i.value)).toEqual(["bevy 0.19"]);
  });

  it("returns null for an unknown stack", async () => {
    expect(await completeArgs(dir, "nope ")).toBeNull();
  });

  it("returns null when no templates are installed", async () => {
    const empty = join(tempRoot, "empty");
    await mkdir(empty, { recursive: true });
    expect(await completeArgs(empty, "")).toBeNull();
  });
});

describe("runWizard", () => {
  it("scaffolds + commits + verifies the happy path", async () => {
    const templatesDir = join(tempRoot, "templates");
    const cwd = join(tempRoot, "out");
    await mkdir(cwd, { recursive: true });
    await writeTemplate(templatesDir);

    const ui = new ScriptedUi([
      "demo", // stack
      "My Demo", // project name
      undefined, // target dir -> default
      undefined, // window_title -> default "My Demo"
      undefined, // crate_name -> default "my_demo"
      "yes", // summary confirm
      "None (no remote)", // remote after first commit
      "skip", // verify -> skip
    ]);

    const result = await runWizard(ui, { templatesDir, cwd, args: [] });

    const dest = resolve(cwd, "My Demo");
    expect(result.destDir).toBe(dest);
    expect(result.vars.project_name_snake).toBe("my_demo");
    expect(result.verification).toMatchObject({ depth: "skip", ok: true });

    // Template files substituted.
    const welcome = await readFile(join(dest, "welcome.txt"), "utf8");
    expect(welcome).toBe("My Demo My Demo my_demo\n");

    // FOUNDATION artifacts shipped.
    expect(result.files).toContain("AGENTS.md");
    expect(result.files).toContain("docs/vision.md");
    expect(result.files).toContain("docs/architecture.md");
    expect(result.files).toContain("tests/README.md");
    expect(result.files).toContain(".gitignore");
    expect(result.files).toContain("tickets.md");

    // Git initial commit exists.
    await stat(join(dest, ".git", "HEAD"));

    // Next-steps printout names the run command and the docs map.
    const steps = nextSteps(result);
    expect(steps).toContain(`cd ${dest} && ./scripts/run.sh`);
    expect(steps).toContain("docs/vision.md");
  });

  it("preselects stack+version from args without prompting for them", async () => {
    const templatesDir = join(tempRoot, "templates");
    const cwd = join(tempRoot, "out");
    await mkdir(cwd, { recursive: true });
    await writeTemplate(templatesDir, "bevy", "0.19");
    await writeTemplate(templatesDir, "phaser", "4");

    const ui = new ScriptedUi([
      "My Demo", // project name
      undefined, // target dir
      undefined, // window title default
      undefined, // crate name default
      "yes",
      "None (no remote)",
      "skip",
    ]);

    const result = await runWizard(ui, {
      templatesDir,
      cwd,
      args: ["bevy", "0.19"],
    });
    expect(result.manifest.stack).toBe("bevy");
    expect(result.manifest.frameworkVersion).toBe("0.19");
  });

  it("writes nothing when the summary is declined", async () => {
    const templatesDir = join(tempRoot, "templates");
    const cwd = join(tempRoot, "out");
    await mkdir(cwd, { recursive: true });
    await writeTemplate(templatesDir);

    const ui = new ScriptedUi([
      "demo",
      "My Demo",
      undefined,
      undefined,
      undefined,
      undefined, // confirm -> undefined = false
    ]);

    await expect(
      runWizard(ui, { templatesDir, cwd, args: [] }),
    ).rejects.toThrow(WizardCancelled);

    expect(await readdir(cwd)).toEqual([]);
  });

  it("throws WizardCancelled when the user backs out at stack select", async () => {
    const templatesDir = join(tempRoot, "templates");
    await writeTemplate(templatesDir);

    const ui = new ScriptedUi([undefined]);
    await expect(
      runWizard(ui, { templatesDir, cwd: tempRoot, args: [] }),
    ).rejects.toThrow(WizardCancelled);
  });

  it("errors loudly when no templates are installed", async () => {
    const templatesDir = join(tempRoot, "none");
    await mkdir(templatesDir, { recursive: true });
    const ui = new ScriptedUi([]);
    await expect(
      runWizard(ui, { templatesDir, cwd: tempRoot, args: [] }),
    ).rejects.toThrow(/no templates/);
  });
});

describe("runWizard remote (#9)", () => {
  async function scaffoldWith(
    script: Array<string | undefined>,
  ): Promise<{ result: Awaited<ReturnType<typeof runWizard>>; dir: string }> {
    const templatesDir = join(tempRoot, "templates");
    const cwd = join(tempRoot, "out");
    await mkdir(cwd, { recursive: true });
    await writeTemplate(templatesDir);

    const ui = new ScriptedUi([
      "demo",
      "My Demo",
      undefined,
      undefined,
      undefined,
      "yes",
      ...script,
      "skip",
    ]);
    const result = await runWizard(ui, {
      templatesDir,
      cwd,
      args: [],
    });
    return { result, dir: resolve(cwd, "My Demo") };
  }

  it("defaults to no remote when the choice is None", async () => {
    const { result } = await scaffoldWith(["None (no remote)"]);
    expect(result.remote).toEqual({ choice: "none" });
  });

  it("treats a defer/dismiss at the remote prompt as no remote", async () => {
    const { result } = await scaffoldWith([undefined]);
    expect(result.remote).toEqual({ choice: "none" });
  });

  it("adds an existing URL and pushes the first commit to it", async () => {
    // A local bare repo stands in for a real remote origin — no network.
    const origin = join(tempRoot, "origin.git");
    await exec("git", ["init", "--bare", origin]);

    const { result, dir } = await scaffoldWith(["Add an existing URL", origin]);
    expect(result.remote).toEqual({ choice: "url", url: origin });

    // The scaffolded commit landed on the origin branch.
    const { stdout } = await exec("git", ["log", "--oneline"], dir);
    expect(stdout.trim()).toContain(INITIAL_COMMIT_MESSAGE);
  });
});
