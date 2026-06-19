const { sequelize, AuthorizedTag } = require('../models');
const logger = require('../utils/logger');

async function checkAndAddTag() {
  try {
    console.log('Checking database for tag 123456...');
    
    // Find the tag in the database
    let tag = await AuthorizedTag.findOne({ 
      where: { tagId: '123456' } 
    });
    
    // If the tag exists, log its details
    if (tag) {
      console.log('Tag already exists:');
      console.log(JSON.stringify(tag.toJSON(), null, 2));
    } else {
      // If the tag doesn't exist, create it
      console.log('Tag 123456 not found. Creating it now...');
      
      tag = await AuthorizedTag.create({
        tagId: '123456',
        status: 'Active',
        blocked: false,
        validFrom: new Date(),
        validTo: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // Valid for 1 year
        expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
      });
      
      console.log('Tag created successfully:');
      console.log(JSON.stringify(tag.toJSON(), null, 2));
    }
    
    // List all tags in the database
    console.log('\nListing all authorized tags in the database:');
    const allTags = await AuthorizedTag.findAll();
    console.log(`Found ${allTags.length} tags:`);
    allTags.forEach(t => console.log(`- ${t.tagId} (Status: ${t.status})`));
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    // Close the database connection
    await sequelize.close();
  }
}

// Run the function
checkAndAddTag();
