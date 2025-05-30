import Together from "together-ai";
import fs from "fs";
import { Command } from "commander";
import { fetchConfig, writeConfig } from "./util/configuration.ts";

export async function ocr({
  filePath,
  apiKey = process.env.TOGETHER_API_KEY,
  model = "Llama-3.2-90B-Vision",
}: {
  filePath: string;
  apiKey?: string;
  model?: "Llama-3.2-90B-Vision" | "Llama-3.2-11B-Vision" | "free";
}) {
  const visionLLM =
    model === "free"
      ? "meta-llama/Llama-Vision-Free"
      : `meta-llama/${model}-Instruct-Turbo`;

  const together = new Together({
    apiKey,
  });

  let finalMarkdown = await getMarkDown({ together, visionLLM, filePath });

  return finalMarkdown;
}

async function getMarkDown({
  together,
  visionLLM,
  filePath,
}: {
  together: Together;
  visionLLM: string;
  filePath: string;
}) {
  const systemPrompt = `Convert the provided image into Markdown format. Ensure that all content from the page is included, such as headers, footers, subtexts, images (with alt text if possible), tables, and any other elements.

  Requirements:

  - Output Only Markdown: Return solely the Markdown content without any additional explanations or comments.
  - No Delimiters: Do not use code fences or delimiters like \`\`\`markdown.
  - Complete Content: Do not omit any part of the page, including headers, footers, and subtext.
  `;

  const finalImageUrl = isRemoteFile(filePath)
    ? filePath
    : `data:image/jpeg;base64,${encodeImage(filePath)}`;

  const output = await together.chat.completions.create({
    model: visionLLM,
    messages: [
      {
        role: "user",
        // @ts-expect-error
        content: [
          { type: "text", text: systemPrompt },
          {
            type: "image_url",
            image_url: {
              url: finalImageUrl,
            },
          },
        ],
      },
    ],
  });

  return output.choices[0].message.content;
}

function encodeImage(imagePath: string) {
  const imageFile = fs.readFileSync(imagePath);
  return Buffer.from(imageFile).toString("base64");
}

function isRemoteFile(filePath: string): boolean {
  return filePath.startsWith("http://") || filePath.startsWith("https://");
}

if (import.meta.url === `file://${process.argv[1]}`) {
      const program = new Command();
      program
        .requiredOption("-f, --file <file>", "File to OCR")
        .option("-k, --key <key>", "API Key")
        .option("-m, --model <model>", "Model to use")
        .option("--save-key", "Save provided API key to config file")
        .action(async (options) => {
            try {
                let apiKey = options.key || process.env.TOGETHER_API_KEY || (await fetchConfig().then((config) => config.apiKey));
                if (!apiKey) {
                    console.error("❌ API key not provided. Use --key or set it in .env or config.");
                    process.exit(1);
                }

                // Save key to config file if user asked
                if (options.saveKey) {
                    const config = await fetchConfig();
                    config.apiKey = apiKey;
                    await writeConfig(config);
                    console.log("API key saved to ~/.llamaocr.json");
                }

                const markdown = await ocr({
                    filePath: options.file,
                    apiKey: options.key,
                    model: options.model,
                });
                console.log(markdown);
            } catch (error) {
                console.error("Error processing OCR: ", error);
            }
        });
    program.parse(process.argv);
}
