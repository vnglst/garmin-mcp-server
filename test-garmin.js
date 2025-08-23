#!/usr/bin/env node

// Simple test script to verify Garmin authentication and data fetching
import pkg from "garmin-connect";
const { GarminConnect } = pkg;
import * as dotenv from "dotenv";

dotenv.config();

async function testGarminConnection() {
    console.log('🔄 Testing Garmin Connect authentication...');
    
    const garminConnect = new GarminConnect({
        username: process.env.GARMIN_USERNAME || '',
        password: process.env.GARMIN_PASSWORD || '',
    });

    try {
        // Test authentication
        console.log('🔐 Authenticating with Garmin Connect...');
        await garminConnect.login();
        console.log('✅ Successfully authenticated with Garmin Connect!');

        // Test fetching recent activities
        console.log('📊 Fetching recent activities...');
        const activities = await garminConnect.getActivities(0, 5);
        console.log(`✅ Found ${activities.length} recent activities`);

        // Filter for running activities
        const runningActivities = activities.filter(activity => 
            activity.activityType?.typeKey === 'running' || 
            activity.activityType?.typeKey === 'track_running' ||
            activity.activityType?.typeKey === 'treadmill_running' ||
            activity.activityType?.typeKey === 'trail_running'
        );

        console.log(`🏃‍♂️ Found ${runningActivities.length} running activities:`);
        
        runningActivities.forEach((activity, index) => {
            const distanceKm = (activity.distance || 0) / 1000;
            const durationMin = Math.round((activity.duration || 0) / 60);
            const date = activity.startTimeLocal ? activity.startTimeLocal.split('T')[0] : 'Unknown';
            
            console.log(`  ${index + 1}. ${date}: ${distanceKm.toFixed(2)}km in ${durationMin}min (ID: ${activity.activityId})`);
        });

        if (runningActivities.length > 0) {
            console.log('🎉 Garmin integration is working perfectly!');
            console.log('💡 Your MCP server is ready to provide real running data to Claude.');
        } else {
            console.log('⚠️  No running activities found. Make sure you have recent runs in Garmin Connect.');
        }

    } catch (error) {
        console.error('❌ Error testing Garmin connection:', error.message);
        console.log('💡 Please check your credentials in the .env file');
    }
}

// Run the test
testGarminConnection().catch(console.error);
