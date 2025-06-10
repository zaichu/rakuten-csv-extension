export interface DownloadResponse {
    success: boolean;
    message?: string;
}

export interface Message {
    state?: 'success' | 'error';
    content: string;
}

export interface IconLabelProps {
    icon: string;
    label: string;
    containerClassName?: string;
    iconClassName?: string;
}