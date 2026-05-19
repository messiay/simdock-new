export const config = {
    // For Hugging Face Spaces, set VITE_API_BASE_URL to your Space's direct URL (e.g., https://username-spacename.hf.space)
    API_BASE_URL: import.meta.env.VITE_API_BASE_URL || 'https://clicking-suburban-offshore-some.trycloudflare.com',
    ENDPOINTS: {
        PROJECTS: '/projects',
        DOCKING: '/docking',
        ANALYSIS: '/analysis',
        SYSTEM: '/system',
        FETCH: '/fetch',
        CONVERT: '/convert'
    }
};
