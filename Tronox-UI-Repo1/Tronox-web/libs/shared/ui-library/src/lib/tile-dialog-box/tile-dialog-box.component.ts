import {
  AfterViewChecked,
  Component,
  ElementRef,
  inject,
  Inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import {
  MatDialogModule,
  MatDialogTitle,
  MatDialogContent,
  MatDialogClose,
} from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TileService } from '@tronox-web/util-library';
import { TestResultDialogComponent } from '../test-result-dialog/test-result-dialog.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { HttpClient } from '@angular/common/http';
import { EXPRESS_BASE_URL } from '../consts';
@Component({
  selector: 'lib-tile-dialog-box',
  imports: [
    CommonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogClose,
    MatButtonModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatIconModule,
    MatTableModule,
  ],
  templateUrl: './tile-dialog-box.component.html',
  styleUrl: './tile-dialog-box.component.scss',
})
export class TileDialogBoxComponent
  implements AfterViewChecked, OnInit, OnDestroy
{
  hasResults = true;
  logs: any;
  logContent: any;
  logInterval: any;
  terminalVisible = false;
  terminalOutput: string[] = [];
  constructor(
    public dialogRef: MatDialogRef<TileDialogBoxComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private readonly tileService: TileService,
    private http: HttpClient
  ) {}
  ngOnInit(): void {
    // Display the logs every 10 seconds
    this.logInterval = setInterval(() => this.getLogs(), 3000);
  }

  ngOnDestroy(): void {
    if (this.logInterval) clearInterval(this.logInterval);
  }

  // Helps to display the logs
  getLogs(): void {
    this.http
      .get(`${EXPRESS_BASE_URL}/get-log`, { responseType: 'text' })
      .subscribe({
        next: (data: string) => {
          this.terminalOutput = data
            .split('\n')
            .filter((line) => line.trim() !== '');
          setTimeout(() => {
            const terminal = document.querySelector('.terminal');
            if (terminal) terminal.scrollTop = terminal.scrollHeight;
          }, 100);
        },
        error: (err: any) => {
          console.error('❌ Failed to fetch logs:', err);
        },
      });
  }

  clearLogs(): void {
    this.tileService.clearLogFile().subscribe({
      next: () => {
        console.log(' Logs cleared successfully');
        this.logContent = []; // Clear log data in UI
      },
      error: (err) => {
        console.error('Failed to clear logs:', err);
      },
    });
  }

  fileName: string | null = null;
  fileUrl: string | null = null;
  fileUploaded = false;
  isProcessing = false;
  file: File | undefined;
  result: any;
  private dialog = inject(MatDialog);
  previousResultLength: any;
  wordFileBlob: Blob | null = null; // Variable to store the file
  testResults: any[] = [];
  @ViewChild('resultsContainer') resultsContainer: ElementRef | undefined;
  @ViewChild('resultsTable') resultsTable!: ElementRef;
  onFileSelected(event: any): void {
    this.file = event.target.files[0];

    if (this.file) {
      this.fileName = this.file.name;

      // Create a temporary URL for downloading
      const objectUrl = URL.createObjectURL(this.file);
      this.fileUrl = objectUrl;
      this.fileUploaded = true;
      this.wordFileBlob = null;
    }
  }

  runScript(): void {
    if (!this.file) return;

    //Clear logs after test completes
    this.clearLogs();
    this.isProcessing = true;
    this.terminalOutput = []; // clear logs
    this.terminalVisible = true;
    this.getLogs(); // initial log fetch

    this.tileService
      .uploadAndFetchRealTimeRes(this.file, this.data?.tile?.appNamespec)
      .subscribe({
        next: (chunk) => {
          const logPattern =
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z - Testcase failed at .+$/gm;
          const filteredLines = chunk.match(logPattern) || [];
          if (filteredLines.length > 0) {
            this.terminalOutput.push(...filteredLines);
          }
        },
        error: (error) => {
          console.error('❌ Error uploading file:', error);
          this.isProcessing = false;
          this.fetchTestResults();
        },
        complete: () => {
          this.isProcessing = false;
          this.fetchTestResults();
        },
      });
  }

  fetchTestResults() {
    this.tileService.getTestCaseResults().subscribe({
      next: (results) => {
        this.testResults = results;
        this.hasResults = this.testResults.length > 0;
        //console.log('Lav', this.testResults);
      },
      error: (err) => {
        console.error('Error fetching test results:', err);
      },
    });
  }

  openResultsDialog(result: any) {
    this.dialog.open(TestResultDialogComponent, {
      disableClose: true,
      height: '800px',
      width: '1200px',
      data: result,
    });
  }

  downloadTemplate(): void {
    if (!this.wordFileBlob) {
      alert('No file available for download. Please run the script first.');
      return;
    }

    const a = document.createElement('a');
    const objectUrl = URL.createObjectURL(this.wordFileBlob);
    a.href = objectUrl;
    a.download = `Screenshots_${Date.now()}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);

    console.log('📥 Word file downloaded');
  }

  closeDialog(): void {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    URL.revokeObjectURL(this.fileUrl!);
    this.dialogRef.close();
  }

  scrollToBottom() {
    if (this.resultsContainer) {
      this.resultsContainer.nativeElement.scrollTop =
        this.resultsContainer.nativeElement.scrollHeight;
    }
  }

  ngAfterViewChecked() {
    this.adjustDialogHeight();
    if (
      this.resultsContainer &&
      this.result.length > this.previousResultLength
    ) {
      this.scrollToBottom();
    }
    this.previousResultLength = this.result.length;
  }

  adjustDialogHeight() {
    if (this.resultsTable?.nativeElement) {
      const tableHeight = this.resultsTable.nativeElement.offsetHeight;
      const baseHeight = 400; // Minimum dialog height
      const maxHeight = 700; // Prevent excessive height growth

      const newHeight = Math.min(baseHeight + tableHeight, maxHeight);
      this.dialogRef.updateSize('600px', `${newHeight}px`);
    }
  }
}
