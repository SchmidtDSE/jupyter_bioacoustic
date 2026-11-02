/**
 * Code builders the plugin uses to open a project / copy the starter notebook.
 *
 * License: BSD 3-Clause
 */
import { copyStarterNotebook, openProjectInKernel } from '../python';

describe('openProjectInKernel', () => {
  it('chdirs, validates, then sets up the annotator', () => {
    const code = openProjectInKernel('/srv/work', 'projects/p.yaml');
    const lines = code.split('\n');
    expect(lines[1]).toBe("_os.chdir(_os.path.expanduser('/srv/work'))");
    expect(code).toContain("_cb.load_config('projects/p.yaml')");
    expect(code).toContain("raise ValueError('Config validation failed:\\n'");
    expect(lines[lines.length - 2]).toBe("_ba = _BA(project='projects/p.yaml')");
    expect(lines[lines.length - 1]).toBe('_ba.setup()');
  });

  it('escapes quotes and newlines in paths', () => {
    const code = openProjectInKernel("/o'neil", "a'b\nc.yaml");
    expect(code).toContain("expanduser('/o\\'neil')");
    expect(code).toContain("load_config('a\\'b\\nc.yaml')");
  });
});

describe('copyStarterNotebook', () => {
  it('copies into the escaped cwd and prints JSON', () => {
    const code = copyStarterNotebook("/w/it's");
    expect(code).toContain("_os.chdir(_os.path.expanduser('/w/it\\'s'))");
    expect(code).toContain("print(json.dumps(copy_starter_notebook('.')))");
  });
});
