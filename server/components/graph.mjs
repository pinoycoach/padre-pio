export async function createInworldGraph() {
    // Dynamically import @inworld/runtime components
    const { GraphBuilder } = await import('@inworld/runtime/graph');
    const { 
        LLMChatRequestBuilderNode,
        RemoteLLMChatNode,
        RemoteTTSNode,
        TextChunkingNode,
    } = await import('@inworld/runtime/graph/nodes');

    const builder = new GraphBuilder({
        id: 'still-small-voice-graph',
        apiKey: process.env.INWORLD_API_KEY,
        enableRemoteConfig: false,
    });

    // 1. Format user input for the LLM
    const chatRequestBuilder = builder.addNode(new LLMChatRequestBuilderNode({
        systemPrompt: `You are the 'Still Small Voice', a spiritual guide. 
    Your tone is empathetic, wise, and grounded in ancient wisdom. 
    Analyze the seeker's words for their spiritual archetype.`,
    }));

    // 2. The LLM Node (Gemini via Inworld)
    const llmNode = builder.addNode(new RemoteLLMChatNode({
        provider: 'SERVICE_PROVIDER_GOOGLE',
        modelName: 'gemini-3-flash-preview',
        stream: true,
    }));

    // 3. Chunk text for optimal TTS
    const chunkingNode = builder.addNode(new TextChunkingNode());

    // 4. TTS Node
    const ttsNode = builder.addNode(new RemoteTTSNode({
        speakerId: process.env.VITE_INWORLD_VOICE_ID || 'Luna',
        modelId: 'inworld_tts_1_5_max',
    }));

    // Define the flow
    builder
        .setStartNode(chatRequestBuilder)
        .setEndNode(ttsNode)
        .connect(
            chatRequestBuilder.outputs.chatRequest,
            llmNode.inputs.chatRequest
        )
        .connect(
            llmNode.outputs.text,
            chunkingNode.inputs.text
        )
        .connect(
            chunkingNode.outputs.chunk,
            ttsNode.inputs.text
        );

    // Expose inputs and outputs
    return {
        graph: builder.build(),
        inputs: {
            text: chatRequestBuilder.inputs.text,
        },
        outputs: {
            audio: ttsNode.outputs.audio,
            text: llmNode.outputs.text,
        }
    };
}
