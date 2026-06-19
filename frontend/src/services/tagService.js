import api from './api';

const tagService = {
    /**
     * Get all authorized tags
     * @returns {Promise} Promise object with tags data
     */
    getAllTags: async () => {
        try {
            const response = await api.get('/tags');
            return response.data;
        } catch (error) {
            console.error('Error fetching authorized tags:', error);
            return {
                success: false,
                message: 'Error fetching authorized tags',
                error: error.message
            };
        }
    }
};

export default tagService;
