import app from "./app";
import { config } from "./config";
import { startCronJobs } from "./cron";

async function run(){
    await app.listen(config.port, () => {
        console.log(`Server is running on port ${config.port}`);
        startCronJobs();
    });
}
run()