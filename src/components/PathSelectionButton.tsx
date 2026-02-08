import { IconButton, Portal, Box, Text } from "@chakra-ui/react";
import { LuArrowRight } from "react-icons/lu";
import { Tooltip } from "./ui/tooltip";
import { useState, useEffect } from "react";

interface PathSelectionButtonProps {
    selectedText: string;
    position: { x: number; y: number };
    onNavigate: (path: string) => void;
}

/**
 * Floating button that appears when user selects path text (starting with /)
 * Allows navigation to the selected path
 */
function PathSelectionButton({ selectedText, position, onNavigate }: PathSelectionButtonProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setVisible(true), 150);
        return () => clearTimeout(timer);
    }, []);

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onNavigate(selectedText);
    };

    if (!visible) return null;

    return (
        <Portal>
            <style>
                {`
                    @keyframes fadeIn {
                        from {
                            opacity: 0;
                            transform: translateY(-5px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                `}
            </style>
            <Box
                position="fixed"
                left={`${position.x}px`}
                top={`${position.y}px`}
                zIndex={9999}
                animation="fadeIn 0.2s ease-in-out"
                pointerEvents="auto"
            >
                <Tooltip
                    content={
                        <Text maxWidth="300px" wordBreak="break-all">
                            导航到路径: {selectedText}
                        </Text>
                    }
                    openDelay={100}
                    closeDelay={200}
                    interactive
                    positioning={{ placement: "top" }}
                    contentProps={{
                        bg: "bg.panel",
                        color: "fg",
                        borderWidth: "1px",
                        borderColor: "border",
                        shadow: "lg",
                        p: 2,
                        borderRadius: "md",
                        zIndex: 10001
                    }}
                >
                    <IconButton
                        aria-label="Navigate to path"
                        size="sm"
                        colorScheme="blue"
                        onClick={handleClick}
                        boxShadow="lg"
                        _hover={{
                            transform: "scale(1.1)",
                            boxShadow: "xl",
                        }}
                        transition="all 0.2s"
                    >
                        <LuArrowRight />
                    </IconButton>
                </Tooltip>
            </Box>
        </Portal>
    );
}

export default PathSelectionButton;
