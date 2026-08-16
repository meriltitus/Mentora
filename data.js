// Mock data for Voice-First AI Learning Tutor HUD
// Includes walkthrough scripts and concept states to drive the simulations.

const learningPaths = {
  unifiedJourney: {
    title: "Neural Networks Intro",
    concepts: [
      { id: "neurons", name: "Neurons", description: "Basic mathematical nodes multiplying inputs by weights." },
      { id: "activations", name: "Activation Functions", description: "Introduce non-linear math to resolve complex boundaries." },
      { id: "forward_prop", name: "Forward Propagation", description: "Flow of input data to calculate predictions." },
      { id: "loss", name: "Loss Functions", description: "Measure accuracy of predictions compared to targets." },
      { id: "backprop", name: "Backpropagation", description: "Calculate gradients using the chain rule." },
      { id: "gradient", name: "Gradient Descent", description: "Optimizer to update weights and minimize loss." }
    ],
    steps: [
      {
        stepIndex: 0,
        currentConcept: "core",
        agentState: "IDLE",
        agentStateLabel: "Awaiting Curiosity",
        aiSpeech: "Welcome. What spark of curiosity brings you here today?",
        userSpeech: "",
        conceptsStatus: {
          neurons: "locked",
          activations: "locked",
          forward_prop: "locked",
          loss: "locked",
          backprop: "locked",
          gradient: "locked"
        }
      },
      {
        stepIndex: 1,
        currentConcept: "core",
        agentState: "LISTENING",
        agentStateLabel: "Listening...",
        aiSpeech: "",
        userSpeech: "I want to learn neural networks, but I don't know where to start.",
        conceptsStatus: {
          neurons: "locked",
          activations: "locked",
          forward_prop: "locked",
          loss: "locked",
          backprop: "locked",
          gradient: "locked"
        }
      },
      {
        stepIndex: 2,
        currentConcept: "core",
        agentState: "THINKING",
        agentStateLabel: "BUILDING ROADMAP",
        aiSpeech: "Understood. I'll build a path from the fundamentals upward.",
        userSpeech: "",
        conceptsStatus: {
          neurons: "locked",
          activations: "locked",
          forward_prop: "locked",
          loss: "locked",
          backprop: "locked",
          gradient: "locked"
        }
      },
      {
        stepIndex: 3,
        currentConcept: "neurons",
        agentState: "SPEAKING",
        agentStateLabel: "Roadmap Materialized",
        aiSpeech: "I've structured a path for you covering: Neurons, Activation Functions, Forward Propagation, Loss Functions, Backpropagation, and Gradient Descent. Let's start with Neurons.",
        userSpeech: "",
        conceptsStatus: {
          neurons: "locked",
          activations: "locked",
          forward_prop: "locked",
          loss: "locked",
          backprop: "locked",
          gradient: "locked"
        }
      },
      {
        stepIndex: 4,
        currentConcept: "neurons",
        agentState: "SPEAKING",
        agentStateLabel: "Direct Instruction",
        aiSpeech: "An artificial neuron takes numeric inputs, multiplies them by weights, adds them up, and adds a bias to output a prediction.",
        userSpeech: "",
        conceptsStatus: {
          neurons: "locked",
          activations: "locked",
          forward_prop: "locked",
          loss: "locked",
          backprop: "locked",
          gradient: "locked"
        }
      },
      {
        stepIndex: 5,
        currentConcept: "neurons",
        agentState: "LISTENING",
        agentStateLabel: "Listening to Explanation",
        aiSpeech: "How would you explain the basic role of a neuron in your own words?",
        userSpeech: "Uhm, it takes some numbers, multiplies them by weights, adds a bias, and passes that sum forward.",
        conceptsStatus: {
          neurons: "locked",
          activations: "locked",
          forward_prop: "locked",
          loss: "locked",
          backprop: "locked",
          gradient: "locked"
        }
      },
      {
        stepIndex: 6,
        currentConcept: "neurons",
        agentState: "CONFIRMED",
        agentStateLabel: "Mastery Confirmed",
        aiSpeech: "Exactly. You've mastered this concept! Let's lock this in.",
        userSpeech: "",
        conceptsStatus: {
          neurons: "mastered",
          activations: "locked",
          forward_prop: "locked",
          loss: "locked",
          backprop: "locked",
          gradient: "locked"
        }
      },
      {
        stepIndex: 7,
        currentConcept: "activations",
        agentState: "SPEAKING",
        agentStateLabel: "Teaching Concept",
        aiSpeech: "Now, let's look at Activation Functions. Why do we need functions like ReLU instead of just using linear equations?",
        userSpeech: "",
        conceptsStatus: {
          neurons: "mastered",
          activations: "locked",
          forward_prop: "locked",
          loss: "locked",
          backprop: "locked",
          gradient: "locked"
        }
      },
      {
        stepIndex: 8,
        currentConcept: "activations",
        agentState: "LISTENING",
        agentStateLabel: "Listening...",
        aiSpeech: "Why do we need non-linear functions?",
        userSpeech: "Because without non-linearity, a multi-layer network is just a single linear layer, so it can't learn complex shapes.",
        conceptsStatus: {
          neurons: "mastered",
          activations: "locked",
          forward_prop: "locked",
          loss: "locked",
          backprop: "locked",
          gradient: "locked"
        }
      },
      {
        stepIndex: 9,
        currentConcept: "activations",
        agentState: "CONFIRMED",
        agentStateLabel: "Mastery Confirmed",
        aiSpeech: "Excellent reasoning. Non-linearity lets neural networks draw complex decision boundaries. Activation Functions: Mastered.",
        userSpeech: "",
        conceptsStatus: {
          neurons: "mastered",
          activations: "mastered",
          forward_prop: "locked",
          loss: "locked",
          backprop: "locked",
          gradient: "locked"
        }
      },
      {
        stepIndex: 10,
        currentConcept: "forward_prop",
        agentState: "SPEAKING",
        agentStateLabel: "Advancing",
        aiSpeech: "Moving to Forward Propagation. Walk me through what happens to data as it travels from the inputs to the final loss calculation.",
        userSpeech: "",
        conceptsStatus: {
          neurons: "mastered",
          activations: "mastered",
          forward_prop: "locked",
          loss: "locked",
          backprop: "locked",
          gradient: "locked"
        }
      },
      {
        stepIndex: 11,
        currentConcept: "forward_prop",
        agentState: "LISTENING",
        agentStateLabel: "Listening...",
        aiSpeech: "Walk me through what happens to data as it travels.",
        userSpeech: "Well, you pass the inputs forward through layers, and then you just instantly update the weights at the end.",
        conceptsStatus: {
          neurons: "mastered",
          activations: "mastered",
          forward_prop: "locked",
          loss: "locked",
          backprop: "locked",
          gradient: "locked"
        }
      },
      {
        stepIndex: 12,
        currentConcept: "forward_prop",
        agentState: "GAP DETECTED",
        agentStateLabel: "Analyzing Understanding",
        aiSpeech: "SYS // CONCEPTUAL GAP DETECTED: Weight update timing misconception.",
        userSpeech: "",
        conceptsStatus: {
          neurons: "mastered",
          activations: "mastered",
          forward_prop: "gap-detected",
          loss: "locked",
          backprop: "locked",
          gradient: "locked"
        }
      },
      {
        stepIndex: 13,
        currentConcept: "forward_prop",
        agentState: "CORRECTING",
        agentStateLabel: "Probing Understanding",
        aiSpeech: "Wait, you mentioned updating weights instantly. In forward propagation, weights are only used to make predictions. Weight updates happen later in backpropagation.",
        userSpeech: "",
        conceptsStatus: {
          neurons: "mastered",
          activations: "mastered",
          forward_prop: "gap-detected",
          loss: "locked",
          backprop: "locked",
          gradient: "locked"
        }
      },
      {
        stepIndex: 14,
        currentConcept: "forward_prop",
        agentState: "CONFIRMED",
        agentStateLabel: "Mastery Confirmed",
        aiSpeech: "Ah, I see! So forward prop is strictly the feedforward path to compute the prediction and loss. Backpropagation is where weights actually get updated.",
        userSpeech: "",
        conceptsStatus: {
          neurons: "mastered",
          activations: "mastered",
          forward_prop: "mastered",
          loss: "locked",
          backprop: "locked",
          gradient: "locked"
        }
      }
    ]
  }
};

window.learningPaths = learningPaths;
