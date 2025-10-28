import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";

export default function IndexScreen() {
  return (
    <SafeAreaView>
      <Text>Child</Text>
      <Link href="/about">Go to About</Link>
    </SafeAreaView>
  );
}
