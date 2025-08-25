
export interface User {
  username: string;
  password?: string; // Only used for registration, not stored
}

export interface MediaFile {
  id: string;
  name: string;
  type: 'image' | 'video';
  mimeType: string;
  size: number;
  dataUrl: string; // base64
  category: string;
  tags: string[];
  uploadDate: string;
  views: number;
  width?: number;
  height?: number;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export enum ViewMode {
  GRID = 'grid',
  LIST = 'list',
}
