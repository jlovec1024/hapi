export const LONG_CONTENT_COLLAPSE_THRESHOLD = 1000

export function shouldAutoCollapseContent(text: string, threshold: number = LONG_CONTENT_COLLAPSE_THRESHOLD): boolean {
    return text.length > threshold
}
