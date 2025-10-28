import React, {Suspense} from "react";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationIndependentTree } from "@react-navigation/native"; 

const ChildApp = React.lazy(() => 
  import("ChildApp/ChildApp"))


export default function IndexScreen() {
  return (
    <SafeAreaView>
      <Text>Host</Text>
      <Suspense fallback={<Text>Loading Child App...</Text>}>

        <NavigationIndependentTree>
          <ChildApp />
        </NavigationIndependentTree>
      </Suspense>
    </SafeAreaView>
  );
}