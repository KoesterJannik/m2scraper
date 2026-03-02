import app from "./app";
import { config } from "./config";
async function run(){
    await app.listen(config.port, () => {
        console.log(`Server is running on port ${config.port}`);
    });
}
run()