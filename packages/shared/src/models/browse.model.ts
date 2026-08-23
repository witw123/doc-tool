export interface BrowseItem {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number | null;
  mtime?: string | null;
}

export interface BrowseResponse {
  success: boolean;
  current_path: string;
  parent_path?: string | null;
  items: BrowseItem[];
}
