import { buildMagitUri, MagitUri } from '../common/magitUri';
import { DocumentView, RebuildableViewKind } from './general/documentView';
import { MagitRepository } from '../models/magitRepository';
import { processLog } from '../extension';
import { View } from './general/view';
import { MagitProcessLogEntry } from '../models/magitProcessLogEntry';
import { TextView } from './general/textView';

class ProcessLogEntryView extends View {
  isFoldable = true;

  get id() { return '' + this.entry.index; }

  constructor(private entry: MagitProcessLogEntry) {
    super();
    this.addSubview(
      new TextView(this.renderCommandStatus(entry) + entry.command.join(' '))
    );
    if (entry.stdout) {
      this.addSubview(new TextView(entry.stdout));
    }
    if (entry.stderr) {
      this.addSubview(new TextView(entry.stderr));
    }
  }

  private renderCommandStatus(entry: MagitProcessLogEntry) {
    let statusChar = 'run';

    if (entry.exitCode !== undefined) {
      statusChar = entry.exitCode.toString();
    }
    return `[${statusChar}] `;
  }
}

export default class ProcessView extends DocumentView {

  constructor(uri: MagitUri) {
    super(uri);
    this.provideContent();
  }

  provideContent() {

    if (processLog.length > 0) {
      this.subViews = processLog.map(entry => new ProcessLogEntryView(entry));
    } else {
      this.subViews = [new TextView('(No entries yet)')];
    }
  }

  public update(state: MagitRepository): void {
    this.provideContent();
    this.triggerUpdate();
  }

}

export const Process: RebuildableViewKind<[]> = {
  authority: 'process',
  buildUri: (repo) => buildMagitUri(repo.uri, 'process', {
    authority: Process.authority,
    fragment: 'process',
  }),
  build: async (uri) => new ProcessView(uri),
};