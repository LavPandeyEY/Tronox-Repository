import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  EXPRESS_BASE_URL,
  GET_TILES,
  GET_WORD_DOC,
  REALTIME_RESULT_URL,
  TEST_RESULTS,
  UPLOAD_EXCEL,
} from '../consts';

@Injectable({
  providedIn: 'root',
})
export class TileService {
  constructor(private http: HttpClient) {}

  getLogUpdates() {
    return this.http.get(`${EXPRESS_BASE_URL}/get-log-updates`, {
      responseType: 'text',
    });
  }
  getLogs() {
    return this.http.get(`${EXPRESS_BASE_URL}/get-log`, {
      responseType: 'text',
    });
  }
  clearLogFile(): Observable<any> {
    return this.http.post(`${EXPRESS_BASE_URL}/clear-log`, {});
  }

  getTiles(): Observable<any> {
    const headers = this.setHeaders();
    return this.http.get<any>(GET_TILES, { headers });
  }

  uploadExcelToServer(file: File): Observable<any> {
    const headers = this.setHeaders();
    const formData = new FormData();
    formData.append('file', file);

    return this.http
      .post(UPLOAD_EXCEL, formData, { headers, responseType: 'text' })
      .pipe(
        map((response: any) => {
          try {
            return JSON.parse(response); // Try parsing JSON if possible
          } catch (error) {
            return response; // Return as text if it's not valid JSON
          }
        })
      );
  }

  setHeaders() {
    const token = localStorage.getItem('token');
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  uploadAndFetchRealTimeRes(file: File, testName: string): Observable<string> {
    const headers = this.setHeaders();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('testName', testName);
    return new Observable<string>((observer: any) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', REALTIME_RESULT_URL, true);

      headers.keys().forEach((key) => {
        const value = headers.get(key);
        if (value) {
          xhr.setRequestHeader(key, value);
        }
      });

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 3) {
          observer.next(xhr.responseText);
        } else if (xhr.readyState === 4) {
          observer.complete();
        }
      };

      xhr.send(formData);
    });
  }

  getWordDocResult() {
    const headers = this.setHeaders();
    return this.http.get(GET_WORD_DOC, { headers, responseType: 'blob' });
  }

  getTestCaseResults(): Observable<any[]> {
    const headers = this.setHeaders();
    return this.http.post<any[]>(TEST_RESULTS, {}, { headers });
  }

  // getLogUpdates(): Observable<string> {
  //   return new Observable<string>((observer) => {
  //     const xhr = new XMLHttpRequest();
  //     xhr.open("GET", "http://34.93.231.170:3000/get-log-updates", true);

  //     xhr.onreadystatechange = () => {
  //       if (xhr.readyState === 3) {
  //         observer.next(xhr.responseText);
  //       } else if (xhr.readyState === 4) {
  //         observer.complete();
  //       }
  //     };

  //     xhr.send();
  //   });
  // }
}
