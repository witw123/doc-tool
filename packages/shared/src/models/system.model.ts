export interface OpenFolderRequest {
  path: string;
}

export interface OpenFolderResponse {
  success: boolean;
  message: string;
  path?: string;
}

export interface HealthResponse {
  status: string;
  system: string;
  release: string;
  node_version: string;
  working_directory: string;
}
